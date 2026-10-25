import traceback

from sqlalchemy import text

from ...core.settings import settings
from ...database.connection import database
from ...logging.logging_config import get_logger
from ...valkey.client import valkey_client
from .token_revocation_keys import (
    account_version_key,
    chain_version_key,
    legacy_account_version_key,
    legacy_chain_version_key,
)

logger = get_logger(__name__)


class TokenVersionUnavailableError(Exception):
    """Raised when the durable revocation version cannot be committed/read."""


# These are also used as Valkey cache keys. Postgres is the authority.
ACCOUNT_VERSION_KEY = "account_ver:v2:{email_digest}"
CHAIN_VERSION_KEY = "chain_ver:v2:{email_digest}:{chain_id}"


class TokenVersionStore:
    """Durable account/chain token-version bookkeeping.

    Revocation versions live in Postgres so a cache restart, eviction, or
    operator FLUSHALL cannot resurrect a token. Valkey is refreshed only as a
    best-effort cache and is never consulted for an authorization decision.
    """

    async def _get_version(self, key: str, legacy_key: str | None = None) -> int:
        """Read current and pre-v2 keys during the privacy migration window."""
        async with database.async_session() as session:
            result = await session.execute(
                text(
                    "SELECT version FROM token_revocation_versions "
                    "WHERE key IN (:key, :legacy_key)"
                ),
                {"key": key, "legacy_key": legacy_key or key},
            )
            return max((int(row[0]) for row in result), default=0)

    async def get_versions(self, email: str, chain_id: str) -> tuple[int, int]:
        """Read account and chain versions using one database connection."""
        account_key = account_version_key(email)
        chain_key = chain_version_key(email, chain_id)
        legacy_account_key = legacy_account_version_key(email)
        legacy_chain_key = legacy_chain_version_key(email, chain_id)
        try:
            async with database.async_session() as session:
                result = await session.execute(
                    text(
                        "SELECT key, version FROM token_revocation_versions "
                        "WHERE key IN (:account_key, :chain_key, :legacy_account_key, :legacy_chain_key)"
                    ),
                    {
                        "account_key": account_key,
                        "chain_key": chain_key,
                        "legacy_account_key": legacy_account_key,
                        "legacy_chain_key": legacy_chain_key,
                    },
                )
                versions: dict[str, int] = {}
                for row in result:
                    versions[str(row.key)] = max(versions.get(str(row.key), 0), int(row.version))
                return (
                    max(versions.get(account_key, 0), versions.get(legacy_account_key, 0)),
                    max(versions.get(chain_key, 0), versions.get(legacy_chain_key, 0)),
                )
        except Exception as error:
            logger.error("Failed to read durable token versions:\n%s", traceback.format_exc())
            raise TokenVersionUnavailableError("durable token revocation store unavailable") from error

    async def _bump_version(self, key: str, legacy_key: str | None = None) -> int:
        """Increment above both formats atomically so rolling upgrades never undo revocation."""
        async with database.async_session() as session:
            result = await session.execute(
                text(
                    "SELECT key, version FROM token_revocation_versions "
                    "WHERE key IN (:key, :legacy_key) FOR UPDATE"
                ),
                {"key": key, "legacy_key": legacy_key or key},
            )
            current = max((int(row.version) for row in result), default=0)
            result = await session.execute(
                text(
                    "INSERT INTO token_revocation_versions (key, version) VALUES (:key, :version) "
                    "ON CONFLICT (key) DO UPDATE SET version = GREATEST("
                    "token_revocation_versions.version + 1, EXCLUDED.version), updated_at = now() "
                    "RETURNING version"
                ),
                {"key": key, "version": current + 1},
            )
            version = int(result.scalar_one())
            await session.commit()
            return version

    async def _cache_version(self, key: str, version: int, *, ttl: int | None = None) -> None:
        """Refresh cache after commit; cache failure must not undo revocation."""
        try:
            await valkey_client.set(key, version)
            if ttl is not None:
                await valkey_client.expire(key, ttl)
        except Exception:
            logger.warning("Failed to refresh token-version cache for %s:\n%s", key, traceback.format_exc())

    async def get_account_version(self, email: str) -> int:
        try:
            return await self._get_version(account_version_key(email), legacy_account_version_key(email))
        except Exception as error:
            logger.error("Failed to read durable account version:\n%s", traceback.format_exc())
            raise TokenVersionUnavailableError("durable account revocation store unavailable") from error

    async def get_chain_version(self, email: str, chain_id: str) -> int:
        try:
            return await self._get_version(
                chain_version_key(email, chain_id), legacy_chain_version_key(email, chain_id)
            )
        except Exception as error:
            logger.error("Failed to read durable chain version:\n%s", traceback.format_exc())
            raise TokenVersionUnavailableError("durable chain revocation store unavailable") from error

    async def bump_account_version(self, email: str) -> bool:
        try:
            key = account_version_key(email)
            version = await self._bump_version(key, legacy_account_version_key(email))
            await self._cache_version(key, version)
            return True
        except Exception:
            logger.error("Failed to bump durable account version:\n%s", traceback.format_exc())
            return False

    async def bump_chain_version(self, email: str, chain_id: str) -> bool:
        try:
            key = chain_version_key(email, chain_id)
            version = await self._bump_version(key, legacy_chain_version_key(email, chain_id))
            await self._cache_version(key, version, ttl=settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60)
            return True
        except Exception:
            logger.error("Failed to bump durable chain version:\n%s", traceback.format_exc())
            return False


token_version_store = TokenVersionStore()
