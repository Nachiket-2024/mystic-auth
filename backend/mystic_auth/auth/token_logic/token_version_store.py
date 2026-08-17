import traceback

from ...core.settings import settings
from ...logging.logging_config import get_logger
from ...redis.client import redis_client

logger = get_logger(__name__)

# Redis key for a user's account-wide token version (see jwt_service.py's
# create_access_token/create_refresh_token). Bumping it is "logout
# everywhere" in one atomic INCR, no per-token bookkeeping. Never expires:
# it must keep meaning the same thing for as long as the account exists.
ACCOUNT_VERSION_KEY = "account_ver:{email}"

# Redis key for one login's version, scoped to its chain_id (see
# jwt_service.py's create_refresh_token). TTL'd to the refresh-token
# lifetime on bump: past that, nothing could still validly use this
# chain_id, so the key can expire instead of accumulating forever.
CHAIN_VERSION_KEY = "chain_ver:{email}:{chain_id}"


class TokenVersionStore:
    """
    Redis-backed account/chain token-version bookkeeping that
    jwt_service.py's revocation checks (is_current_version) and every
    revoke-everything/revoke-one-session caller (RefreshTokenService,
    SessionService) read and bump. Split out of jwt_service.py, which owns
    JWT encode/decode/verify itself but delegates every version read/bump to
    this class.
    """

    async def get_account_version(self, email: str) -> int:
        """Current account-wide version, 0 if it has never been bumped
        (i.e. this account has never had a whole-account revoke)."""
        try:
            raw = await redis_client.get(ACCOUNT_VERSION_KEY.format(email=email))
            return int(raw) if raw is not None else 0
        except Exception:
            logger.warning("Failed to read account version for %s:\n%s", email, traceback.format_exc())
            return 0

    async def get_chain_version(self, email: str, chain_id: str) -> int:
        """Current version for one chain, 0 if it has never been bumped
        (i.e. this specific session has never been individually revoked)."""
        try:
            raw = await redis_client.get(CHAIN_VERSION_KEY.format(email=email, chain_id=chain_id))
            return int(raw) if raw is not None else 0
        except Exception:
            logger.warning(
                "Failed to read chain version for %s/%s:\n%s", email, chain_id, traceback.format_exc()
            )
            return 0

    async def bump_account_version(self, email: str) -> None:
        """The whole-account revoke: logout-all, password change, account
        deactivation/purge, and reuse-detection on a token with no chain
        claim of its own (unknown lineage, so the maximally-safe response).
        Every token on the account, minted before this call, stops
        matching on its very next use."""
        try:
            await redis_client.incr(ACCOUNT_VERSION_KEY.format(email=email))
        except Exception:
            logger.warning("Failed to bump account version for %s:\n%s", email, traceback.format_exc())

    async def bump_chain_version(self, email: str, chain_id: str) -> None:
        """The single-session revoke: logout (this device only), a
        targeted Manage Sessions "End session", and reuse-detection scoped
        to the compromised chain specifically. Every token sharing this
        chain_id, minted before this call, stops matching on its next use;
        every other chain on the account is completely unaffected."""
        try:
            key = CHAIN_VERSION_KEY.format(email=email, chain_id=chain_id)
            await redis_client.incr(key)
            await redis_client.expire(key, settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60)
        except Exception:
            logger.warning(
                "Failed to bump chain version for %s/%s:\n%s", email, chain_id, traceback.format_exc()
            )


token_version_store = TokenVersionStore()
