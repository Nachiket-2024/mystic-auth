from uuid import uuid4

import pytest
from sqlalchemy import text

from backend.mystic_auth.auth.token_logic.token_revocation_keys import (
    account_version_key,
    chain_version_key,
)
from backend.mystic_auth.auth.token_logic.token_version_store import token_version_store
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.scripts.migrate_token_revocation_identifiers import migrate
from backend.mystic_auth.valkey.client import valkey_client


@pytest.mark.asyncio
async def test_migration_preserves_versions_and_removes_raw_email_keys():
    email = f"token-key-migration-{uuid4().hex}@example.test"
    chain_id = str(uuid4())
    legacy_account_key = f"account_ver:{email}"
    legacy_chain_key = f"chain_ver:{email}:{chain_id}"
    hashed_account_key = account_version_key(email)
    hashed_chain_key = chain_version_key(email, chain_id)
    await valkey_client.set(legacy_account_key, 7)
    await valkey_client.set(legacy_chain_key, 4)

    async with database.async_session() as session:
        await session.execute(
            text(
                "INSERT INTO token_revocation_versions (key, version) VALUES "
                "(:account_key, 7), (:chain_key, 4)"
            ),
            {"account_key": legacy_account_key, "chain_key": legacy_chain_key},
        )
        await session.commit()

    try:
        assert await token_version_store.get_versions(email, chain_id) == (7, 4)
        assert await token_version_store.bump_account_version(email) is True
        migrated = await migrate(apply=True, batch_size=25)
        assert migrated >= 4
        assert await valkey_client.get(legacy_account_key) is None
        assert await valkey_client.get(legacy_chain_key) is None

        async with database.async_session() as session:
            result = await session.execute(
                text("SELECT key, version FROM token_revocation_versions WHERE key IN (:a, :c, :la, :lc)"),
                {
                    "a": hashed_account_key,
                    "c": hashed_chain_key,
                    "la": legacy_account_key,
                    "lc": legacy_chain_key,
                },
            )
            values = {str(row.key): int(row.version) for row in result}
        assert values == {hashed_account_key: 8, hashed_chain_key: 4}
        assert email not in hashed_account_key
        assert email not in hashed_chain_key
    finally:
        async with database.async_session() as session:
            await session.execute(
                text("DELETE FROM token_revocation_versions WHERE key IN (:a, :c, :la, :lc)"),
                {
                    "a": hashed_account_key,
                    "c": hashed_chain_key,
                    "la": legacy_account_key,
                    "lc": legacy_chain_key,
                },
            )
            await session.commit()
        await valkey_client.delete(hashed_account_key)
