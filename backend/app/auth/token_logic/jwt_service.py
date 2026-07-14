from datetime import datetime, timedelta, timezone
import asyncio
import jwt
import uuid
import traceback

from ...core.settings import settings
from ...redis.client import redis_client
from ...logging.logging_config import get_logger

logger = get_logger(__name__)

# Redis key template for a user's refresh-token registry (a jti -> expiry Hash).
# Deliberately NOT named "user:{email}:refresh_tokens" — that name was used
# pre-jti-migration for a Redis SET of raw tokens. Reusing the same key name
# for an incompatible type (Set -> Hash) would make HSET/HGETALL/HDEL raise
# WRONGTYPE against any Redis instance that still holds the old Set from
# before this change, breaking login/refresh/logout-all for every
# already-authenticated user until an operator manually deletes the key. A
# fresh key name sidesteps the collision entirely; old Set-typed keys are
# simply never touched again (they were never given a TTL either, so a
# deployment migrating this template into a live app with existing session
# data should still plan an explicit cleanup of the old key pattern).
REFRESH_TOKEN_REGISTRY_KEY = "refresh_token_registry:{email}"


class JWTService:
    """
    Creates, verifies, and revokes access/refresh JWTs.

    Revocation and session tracking are keyed by the token's "jti" claim rather
    than the raw JWT string. Keying off the raw token would mean every valid,
    unexpired refresh token sits in Redis in cleartext (in the per-user session
    set) — anyone with read access to Redis (a backup, a misconfigured replica,
    a compromised monitoring tool) could lift a token straight out and use it
    without ever touching the database or the JWT secret. A jti is a random,
    otherwise-meaningless identifier: it lets us blacklist/track a specific
    token without Redis ever holding a credential that's usable on its own.
    """

    async def create_access_token(self, email: str, role: str | None) -> str:
        """role is display/grouping metadata only, never consulted for
        authorization (see authorization/); None for an account with no role at all."""
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        jti = uuid.uuid4().hex

        # The "type" claim lets verify_token tell access and refresh tokens
        # apart; the "jti" claim gives revocation/session tracking something to
        # key off of other than the raw token string.
        payload = {"email": email, "role": role, "type": "access", "jti": jti, "exp": expire}

        return await asyncio.to_thread(jwt.encode, payload, settings.SECRET_KEY, settings.JWT_ALGORITHM)

    async def create_refresh_token(self, email: str, role: str | None) -> str:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)
        jti = uuid.uuid4().hex

        payload = {"email": email, "role": role, "type": "refresh", "jti": jti, "exp": expire}

        token = await asyncio.to_thread(jwt.encode, payload, settings.SECRET_KEY, settings.JWT_ALGORITHM)

        # Record jti -> expiry (epoch seconds) in the user's refresh-token
        # registry — never the raw token itself.
        await redis_client.hset(REFRESH_TOKEN_REGISTRY_KEY.format(email=email), jti, int(expire.timestamp()))

        return token

    async def verify_token(self, token: str, expected_type: str | None = None) -> dict | None:
        """
        expected_type, if given, must match the token's "type" claim (e.g.
        "access" or "refresh"), otherwise the token is rejected. Pass None to
        skip the check (e.g. for tokens that predate the "type" claim, such as
        password reset tokens).
        """
        try:
            # The algorithm allowlist is passed as a single-element list, not a
            # bare string — PyJWT's `algorithms` parameter accepts a bare string
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

    async def revoke_token(self, token: str, email: str | None = None) -> bool:
        try:
            # Reuses the same canonical decode path as is_token_revoked, rather
            # than re-decoding with a second, separately-maintained jwt.decode call.
            payload = await self.decode_payload(token)

            if not payload:
                logger.warning("Cannot revoke token: decode failed")
                return False

            jti = payload.get("jti")
            exp = payload.get("exp")

            if not jti:
                logger.warning("Cannot revoke token without a jti claim")
                return False

            return await self.revoke_token_by_jti(jti, exp, email)

        except Exception:
            logger.warning("Failed to revoke token:\n%s", traceback.format_exc())
            return False

    async def revoke_token_by_jti(self, jti: str, exp: int | float | None, email: str | None = None) -> bool:
        try:
            # Minimum of 1 second, since Redis requires a positive expiry and an
            # already-expired token still needs its blacklist entry to exist at
            # least momentarily.
            ttl = 1
            if exp is not None:
                ttl = max(1, int(exp - datetime.now(timezone.utc).timestamp()))

            await redis_client.setex(f"revoked:{jti}", ttl, "true")

            if email:
                await redis_client.hdel(REFRESH_TOKEN_REGISTRY_KEY.format(email=email), jti)

            return True

        except Exception:
            logger.warning("Failed to revoke jti %s:\n%s", jti, traceback.format_exc())
            return False

    async def is_token_revoked_by_jti(self, jti: str | None) -> bool:
        """Returns False (not just when unrevoked) when no jti was given —
        tokens minted outside jwt_service, such as password reset tokens,
        carry no jti and were never eligible for this revocation mechanism."""
        if not jti:
            return False

        return await redis_client.exists(f"revoked:{jti}") == 1

    async def is_token_revoked(self, token: str) -> bool:
        """Convenience wrapper for callers (e.g. reuse detection in
        refresh_token_service) that only have the raw token in hand."""
        payload = await self.decode_payload(token)
        jti = payload.get("jti") if payload else None

        if not jti:
            return False

        return await self.is_token_revoked_by_jti(jti)

    async def get_all_refresh_tokens_for_user(self, email: str) -> dict[str, str]:
        """Returns the user's jti -> expiry (Unix timestamp, as a string)
        registry, or an empty dict if they have no active refresh tokens."""
        registry = await redis_client.hgetall(REFRESH_TOKEN_REGISTRY_KEY.format(email=email))

        return registry or {}


jwt_service = JWTService()
