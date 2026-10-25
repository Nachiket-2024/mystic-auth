"""Durable refresh-token single-use claims and retry grace checks."""

import traceback
from datetime import UTC, datetime

from sqlalchemy import text

from ...core.settings import settings
from ...database.connection import database
from ...logging.logging_config import get_logger
from ...valkey.client import valkey_client
from .refresh_rotation_claim import RefreshRotationClaim
from .token_version_store import TokenVersionUnavailableError

logger = get_logger(__name__)


async def is_benign_duplicate_rotation(
    jti: str,
    client_ip: str | None,
    *,
    settings=settings,
    database=database,
    valkey_client=valkey_client,
    logger=logger,
    TokenVersionUnavailableError=TokenVersionUnavailableError,
) -> bool:
    """Recognize a same-IP retry during the short rotation grace window.

    The retry is rejected without minting another token pair or revoking
    the chain created by the successful first request.
    """
    grace = settings.REFRESH_TOKEN_REUSE_GRACE_SECONDS
    if grace <= 0:
        return False
    try:
        async with database.async_session() as session:
            result = await session.execute(
                text("SELECT consumed_at, client_ip FROM consumed_refresh_tokens WHERE jti = :jti"), {"jti": jti}
            )
            row = result.first()
        if row is None:
            marker = await valkey_client.get(f"revoked:{jti}")
            if isinstance(marker, bytes):
                marker = marker.decode()
            if not isinstance(marker, str) or "|" not in marker:
                return False
            claimed_at, claimed_ip = marker.split("|", 1)
            age = datetime.now(UTC).timestamp() - float(claimed_at)
            return 0 <= age <= grace and claimed_ip == (client_ip or "")
        consumed_at, claimed_ip = row
        age = (datetime.now(UTC) - consumed_at).total_seconds()
        return 0 <= age <= grace and claimed_ip == client_ip
    except Exception as error:
        logger.error("Failed to read durable refresh rotation for jti %s:\n%s", jti, traceback.format_exc())
        raise TokenVersionUnavailableError("durable refresh rotation store unavailable") from error


async def claim_jti_for_rotation(
    jti: str,
    exp: int | float | None,
    email: str | None = None,
    client_ip: str | None = None,
    account_ver: int = 0,
    chain_ver: int = 0,
    *,
    settings=settings,
    database=database,
    valkey_client=valkey_client,
    logger=logger,
    TokenVersionUnavailableError=TokenVersionUnavailableError,
) -> RefreshRotationClaim:
    """
    Atomically marks jti as redeemed, only if it wasn't already -
    refresh tokens are single-use, so this is what actually stops the
    exact same token being redeemed twice (a genuine replay, or two
    concurrent requests racing on it), a narrower problem than "is this
    session still authorized" (account_ver/chain_ver) and not solved by
    it: a stolen-but-still-current-version token could otherwise be
    used to mint an unbounded number of new token pairs. Returns True
    only for the call that actually claimed it (safe to proceed with
    rotation). A retry receives the existing claim and is rejected by
    the refresh service; it cannot mint a second child pair.

    A Postgres unique key makes the check-and-claim atomic and survives
    Valkey flushes/restarts. Rows are retained only until the token's
    expiry and removed by the scheduled session cleanup task. `email` is
    retained for interface compatibility; it is not persisted here.
    """
    try:
        if exp is None:
            raise ValueError("refresh token is missing expiry")
        try:
            if await valkey_client.exists(f"revoked:{jti}") == 1:
                return RefreshRotationClaim(False, None, None, None, client_ip, True)
        except Exception:
            logger.warning("Could not read legacy Valkey refresh marker for jti %s", jti)
        expiry = datetime.fromtimestamp(float(exp), tz=UTC)
        async with database.async_session() as session:
            result = await session.execute(
                text(
                    "INSERT INTO consumed_refresh_tokens (jti, consumed_at, expires_at, client_ip, account_ver, chain_ver) VALUES (:jti, now(), :expires_at, :client_ip, :account_ver, :chain_ver) ON CONFLICT (jti) DO NOTHING RETURNING consumed_at, client_ip, account_ver, chain_ver"
                ),
                {
                    "jti": jti,
                    "expires_at": expiry,
                    "client_ip": client_ip,
                    "account_ver": account_ver,
                    "chain_ver": chain_ver,
                },
            )
            row = result.first()
            claimed = row is not None
            if row is None:
                result = await session.execute(
                    text(
                        "SELECT consumed_at, client_ip, account_ver, chain_ver FROM consumed_refresh_tokens WHERE jti = :jti"
                    ),
                    {"jti": jti},
                )
                row = result.first()
            if row is None:
                raise RuntimeError("refresh token claim disappeared during transaction")
            await session.commit()
            consumed_at, stored_ip, stored_account_ver, stored_chain_ver = row
            return RefreshRotationClaim(
                claimed=claimed,
                consumed_at=consumed_at,
                account_ver=int(stored_account_ver),
                chain_ver=int(stored_chain_ver),
                client_ip=stored_ip,
            )
    except Exception as error:
        logger.error("Failed to claim durable refresh jti %s:\n%s", jti, traceback.format_exc())
        raise TokenVersionUnavailableError("durable refresh rotation store unavailable") from error
