"""Replace legacy raw-email revocation keys with keyed v2 identifiers.

Run after deploying code that understands both key formats:
    python -m mystic_auth.scripts.migrate_token_revocation_identifiers --dry-run
    python -m mystic_auth.scripts.migrate_token_revocation_identifiers --apply
"""

import argparse
import asyncio

from sqlalchemy import text

from ..auth.token_logic.token_revocation_keys import hmac_key_from_legacy_key
from ..database.connection import database
from ..valkey.client import valkey_client


async def migrate(*, apply: bool, batch_size: int) -> int:
    total = 0
    try:
        if not apply:
            async with database.async_session() as session:
                result = await session.execute(
                    text(
                        "SELECT count(*) FROM token_revocation_versions "
                        "WHERE (left(key, 12) = 'account_ver:' AND split_part(key, ':', 2) <> 'v2') "
                        "OR (left(key, 10) = 'chain_ver:' AND split_part(key, ':', 2) <> 'v2')"
                    )
                )
                database_count = int(result.scalar_one())
            cache_count = await _migrate_cache_keys(apply=False)
            return database_count + cache_count

        while True:
            async with database.async_session() as session:
                result = await session.execute(
                    text(
                        "SELECT key, version, updated_at FROM token_revocation_versions "
                        "WHERE (left(key, 12) = 'account_ver:' AND split_part(key, ':', 2) <> 'v2') "
                        "OR (left(key, 10) = 'chain_ver:' AND split_part(key, ':', 2) <> 'v2') "
                        "ORDER BY key LIMIT :batch_size FOR UPDATE SKIP LOCKED"
                    ),
                    {"batch_size": batch_size},
                )
                rows = list(result)
                if not rows:
                    await session.rollback()
                    break
                for row in rows:
                    old_key = str(row.key)
                    new_key = hmac_key_from_legacy_key(old_key)
                    if new_key is None:
                        raise ValueError("unrecognized legacy token revocation key; no rows changed")
                    await session.execute(
                        text(
                            "INSERT INTO token_revocation_versions (key, version, updated_at) "
                            "VALUES (:key, :version, :updated_at) ON CONFLICT (key) DO UPDATE SET "
                            "version = GREATEST(token_revocation_versions.version, EXCLUDED.version), "
                            "updated_at = GREATEST(token_revocation_versions.updated_at, EXCLUDED.updated_at)"
                        ),
                        {"key": new_key, "version": int(row.version), "updated_at": row.updated_at},
                    )
                    await session.execute(
                        text("DELETE FROM token_revocation_versions WHERE key = :key"),
                        {"key": old_key},
                    )
                await session.commit()
                total += len(rows)
        total += await _migrate_cache_keys(apply=True)
        return total
    finally:
        await database.engine.dispose()


async def _migrate_cache_keys(*, apply: bool) -> int:
    """Delete legacy cache keys; Postgres remains the revocation authority."""
    count = 0
    batch: list[str] = []
    for pattern, versioned_prefix in (
        ("account_ver:*", "account_ver:v2:"),
        ("chain_ver:*", "chain_ver:v2:"),
    ):
        async for key in valkey_client.scan_iter(match=pattern):
            key_string = str(key)
            if key_string.startswith(versioned_prefix):
                continue
            count += 1
            if apply:
                batch.append(key_string)
                if len(batch) == 500:
                    await valkey_client.delete(*batch)
                    batch.clear()
    if apply and batch:
        await valkey_client.delete(*batch)
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="count legacy rows without changing data")
    mode.add_argument("--apply", action="store_true", help="migrate rows in locked batches")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 10_000:
        parser.error("--batch-size must be between 1 and 10000")
    count = asyncio.run(migrate(apply=args.apply, batch_size=args.batch_size))
    action = "migrated" if args.apply else "legacy rows found"
    print(f"{count} token revocation {action}; no account identifiers were emitted")


if __name__ == "__main__":
    main()
