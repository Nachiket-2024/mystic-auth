import asyncio
import traceback
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from ...core.settings import settings
from ...logging.logging_config import get_logger
from ...redis.client import redis_client
from .token_version_store import token_version_store

logger = get_logger(__name__)


class JWTService:
    """
    Creates, verifies, and revokes access/refresh JWTs.

    Revocation is version-based, not identity-based: a token is valid only
    if its own embedded account_ver and chain_ver still match Redis's
    current values (see ACCOUNT_VERSION_KEY/CHAIN_VERSION_KEY above).
    Rotation replay protection (a refresh token must only ever be redeemed
    once) is a separate, narrower concern - see claim_jti_for_rotation -
    solved by a short-lived per-jti marker, since versioning alone can't
    tell "already used once" from "still current."
    """

    async def create_access_token(self, email: str, chain_id: str) -> str:
        now = datetime.now(UTC)
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        jti = uuid.uuid4().hex

        account_ver, chain_ver = await asyncio.gather(
            self.get_account_version(email), self.get_chain_version(email, chain_id)
        )

        # "iat" is a float (now.timestamp()), not the datetime object
        # itself: PyJWT truncates a datetime-valued exp/iat/nbf claim to
        # whole seconds while encoding (calendar.timegm() drops the
        # microseconds). Nothing here actually compares "iat" anymore
        # (revocation is purely version-based), but callers/tests still
        # read it as "when was this minted", so it keeps real precision
        # rather than silently losing it for no reason.
        payload = {
            "email": email,
            "type": "access",
            "jti": jti,
            "chain": chain_id,
            "account_ver": account_ver,
            "chain_ver": chain_ver,
            "iat": now.timestamp(),
            "exp": expire,
        }

        return await asyncio.to_thread(jwt.encode, payload, settings.SECRET_KEY, settings.JWT_ALGORITHM)

    async def create_refresh_token(self, email: str, chain_id: str) -> str:
        """
        chain_id identifies one continuous login, unchanged across every
        rotation of it: a fresh login mints a new random one (see
        login_service.py/oauth2_service.py), while refresh_token_service.
        refresh_tokens() passes the old token's own chain_id back in so its
        successor stays part of the same chain. This is what lets a
        targeted revoke (logout, Manage Sessions, reuse-detection) end
        exactly this one session via bump_chain_version, without touching
        any other session on the account - see
        docs/mystic_auth/authentication/session-management.md.
        """
        now = datetime.now(UTC)
        expire = now + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
        jti = uuid.uuid4().hex

        account_ver, chain_ver = await asyncio.gather(
            self.get_account_version(email), self.get_chain_version(email, chain_id)
        )

        payload = {
            "email": email,
            "type": "refresh",
            "jti": jti,
            "chain": chain_id,
            "account_ver": account_ver,
            "chain_ver": chain_ver,
            "iat": now.timestamp(),
            "exp": expire,
        }

        return await asyncio.to_thread(jwt.encode, payload, settings.SECRET_KEY, settings.JWT_ALGORITHM)

    async def create_verification_token(self, email: str, expires_minutes: int | None = None) -> str:
        """type="verify" (rather than "access") scopes this token to the
        verify-account endpoint only: every protected route requires
        expected_type="access" via verify_token, so a verification token is
        rejected everywhere else in the app even if it leaks (e.g. via an
        email log or forward). Single-use is enforced by its own Redis key
        (account_verification_service's "verify:{token}"), not by anything
        in this class - it carries no account_ver/chain_ver/jti of its own.

        expires_minutes must match the caller's own single-use Redis key TTL
        and the expiry stated in the verification email. Previously this
        was hardcoded to ACCESS_TOKEN_EXPIRE_MINUTES (15min default) while
        account_verification_service set the Redis key TTL and emailed
        wording using RESET_TOKEN_EXPIRE_MINUTES (60min default), so a user
        clicking the link between 15-60 minutes in got a confusing
        invalid/expired error despite the email promising it should still
        work."""
        expire = datetime.now(UTC) + timedelta(
            minutes=expires_minutes if expires_minutes is not None else settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        jti = uuid.uuid4().hex

        payload = {"email": email, "type": "verify", "jti": jti, "exp": expire}

        return await asyncio.to_thread(jwt.encode, payload, settings.SECRET_KEY, settings.JWT_ALGORITHM)

    async def verify_token(self, token: str, expected_type: str | None = None) -> dict | None:
        """
        expected_type, if given, must match the token's "type" claim (e.g.
        "access" or "refresh"), otherwise the token is rejected. Pass None to
        skip the check (e.g. for tokens that predate the "type" claim, such as
        password reset tokens).
        """
        try:
            # The algorithm allowlist is passed as a single-element list, not a
            # bare string: PyJWT's `algorithms` parameter accepts a bare string
            # as a technically-valid Sequence[str] (Python strings are
            # sequences of characters), which would make its internal
            # membership check an accidental substring match instead of an
            # exact one. A list is the only form PyJWT's own docs endorse for
            # this parameter.
            payload = await asyncio.to_thread(
                jwt.decode, token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
            )

            if await self.is_token_revoked_by_jti(payload.get("jti")):
                return None

            if not await self.is_current_version(payload):
                return None

            if expected_type is not None and payload.get("type") != expected_type:
                logger.warning(
                    "Token type mismatch: expected '%s', got '%s'",
                    expected_type, payload.get("type"),
                )
                return None

            return payload

        except jwt.ExpiredSignatureError:
            return None

        except jwt.InvalidTokenError:
            return None

        except Exception:
            logger.error("JWT verification error:\n%s", traceback.format_exc())
            return None

    async def decode_payload(self, token: str) -> dict | None:
        """
        Decodes a token's claims checking only signature and expiry, deliberately
        skipping the revocation check performed by verify_token.

        Exists for reuse-detection: when a refresh token is presented that
        Redis already shows as revoked, we still need to know which user it
        belonged to in order to revoke their other active sessions. verify_token
        can't be used for that because it would correctly refuse to return a
        payload for a revoked token.
        """
        try:
            return await asyncio.to_thread(
                jwt.decode, token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
            )

        except jwt.PyJWTError:
            return None

    async def claim_jti_for_rotation(self, jti: str, exp: int | float | None, email: str | None = None) -> bool:
        """
        Atomically marks jti as redeemed, only if it wasn't already -
        refresh tokens are single-use, so this is what actually stops the
        exact same token being redeemed twice (a genuine replay, or two
        concurrent requests racing on it), a narrower problem than "is this
        session still authorized" (account_ver/chain_ver) and not solved by
        it: a stolen-but-still-current-version token could otherwise be
        used to mint an unbounded number of new token pairs. Returns True
        only for the call that actually claimed it (safe to proceed with
        rotation), False if it was already claimed.

        SET...NX makes the check-and-claim one atomic Redis operation:
        a separate is_token_revoked_by_jti-then-mark pair would leave a
        real gap where two concurrent requests presenting the identical
        refresh token could both observe "not yet claimed" and both
        proceed to mint a fresh token pair from one token. `email` is
        currently unused here (retained for interface symmetry with
        callers that pass it) - the jti-registry cleanup this used to
        also perform no longer exists now that revocation is version-based.
        """
        try:
            ttl = 1
            if exp is not None:
                ttl = max(1, int(exp - datetime.now(UTC).timestamp()))

            claimed = await redis_client.set(f"revoked:{jti}", "true", nx=True, ex=ttl)

            return bool(claimed)

        except Exception:
            logger.warning("Failed to claim jti %s for rotation:\n%s", jti, traceback.format_exc())
            return False

    async def is_token_revoked_by_jti(self, jti: str | None) -> bool:
        """Returns False (not just when unrevoked) when no jti was given:
        tokens minted outside jwt_service, such as password reset tokens,
        carry no jti and were never eligible for this check."""
        if not jti:
            return False

        return await redis_client.exists(f"revoked:{jti}") == 1

    # Account/chain version reads and bumps live in token_version_store.py
    # (Redis-backed revocation bookkeeping), re-exported here as bound
    # methods so every existing `jwt_service.get_account_version(...)`-style
    # call site keeps working unchanged.
    get_account_version = token_version_store.get_account_version
    get_chain_version = token_version_store.get_chain_version
    bump_account_version = token_version_store.bump_account_version
    bump_chain_version = token_version_store.bump_chain_version

    async def is_current_version(self, payload: dict) -> bool:
        """False (revoked) if either the token's embedded account_ver or
        chain_ver has fallen behind Redis's current value. True (including
        for a token minted before this feature shipped, carrying neither
        claim) whenever there's nothing to compare - same "nothing to check
        against, so don't reject" reasoning as the jti-less early return in
        is_token_revoked_by_jti.

        Public (not just used internally by verify_token): refresh_token_
        service.refresh_tokens() also calls this directly, since rotation
        deliberately bypasses verify_token itself (see that method's own
        comment on why) but must still reject a refresh token that a
        whole-account or single-chain revoke already invalidated - without
        this, a stale-but-still-unused refresh token could keep minting
        fresh sessions indefinitely after logout-all/a password change/a
        targeted Manage Sessions revoke, since claim_jti_for_rotation alone
        only catches a token being reused, not one that's simply stale."""
        email = payload.get("email")
        if not email:
            return True

        account_ver = payload.get("account_ver")
        if account_ver is not None and int(account_ver) != await self.get_account_version(email):
            return False

        chain_id = payload.get("chain")
        chain_ver = payload.get("chain_ver")
        return not (
            chain_id and chain_ver is not None and int(chain_ver) != await self.get_chain_version(email, chain_id)
        )


jwt_service = JWTService()
