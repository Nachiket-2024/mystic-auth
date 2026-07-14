import traceback

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..token_logic.jwt_service import jwt_service
# Refresh token reuse is likely theft, not a routine expired/invalid refresh —
# see _handle_reuse_detected.
from ...audit_log.audit_log_service import log_security_event, REFRESH_TOKEN_REUSE_DETECTED
from ...logging.logging_config import get_logger

logger = get_logger(__name__)


class RefreshTokenService:
    """Rotates, revokes, and detects reuse of refresh tokens, backed entirely by Redis."""

    @staticmethod
    async def refresh_tokens(
        refresh_token: str, db: AsyncSession = None, request: Request | None = None
    ) -> dict[str, str] | None:
        try:
            # Decoded once and threaded through the rest of this method — a
            # previous version decoded the same token up to three separate times
            # (once each in is_token_revoked, verify_token, and revoke_token) and
            # checked its revocation status against Redis twice. This is the
            # busiest endpoint in the auth system (every refresh happens on every
            # access-token expiry, for every session), so that redundant work mattered.
            payload = await jwt_service.decode_payload(refresh_token)

            if not payload:
                return None

            jti = payload.get("jti")

            # Refresh tokens are single-use (revoked immediately after rotation),
            # so a revoked token being presented again means it was replayed —
            # either the legitimate user retried a stale token, or the token was
            # stolen and is being used by an attacker in parallel with its
            # rightful owner. Either way, the whole session is now treated as
            # compromised: every refresh token for that user is revoked, forcing
            # re-authentication on all devices.
            if await jwt_service.is_token_revoked_by_jti(jti):
                await RefreshTokenService._handle_reuse_detected(payload, db, request)
                return None

            if payload.get("type") != "refresh":
                logger.warning(
                    "Token type mismatch during refresh: expected 'refresh', got '%s'",
                    payload.get("type"),
                )
                return None

            # role is optional — a roleless account (see user_model.py: role is
            # nullable, and every PBAC-authorized account is authorized purely
            # through assigned policies, never role) must still be able to
            # refresh its session. Requiring role here previously rejected
            # rotation outright for every such account, including every
            # OAuth2-created user (oauth2_service.py always creates new accounts
            # with role=None) — they could log in and get an access token, but
            # the moment it expired they were silently logged out despite
            # holding a valid, unexpired, unrevoked refresh token.
            email = payload.get("email")
            role = payload.get("role")

            if not email:
                return None

            await jwt_service.revoke_token_by_jti(jti, payload.get("exp"), email)

            new_access_token = await jwt_service.create_access_token(email, role)
            new_refresh_token = await jwt_service.create_refresh_token(email, role)

            return {"access_token": new_access_token, "refresh_token": new_refresh_token}

        except Exception:
            logger.error("Error refreshing token:\n%s", traceback.format_exc())
            return None

    @staticmethod
    async def revoke_refresh_token(refresh_token: str) -> bool:
        try:
            payload = await jwt_service.verify_token(refresh_token, expected_type="refresh")

            if not payload:
                return False

            email = payload.get("email")

            if not email:
                return False

            await jwt_service.revoke_token(refresh_token, email)

            return True

        except Exception:
            logger.error("Error revoking refresh token:\n%s", traceback.format_exc())
            return False

    @staticmethod
    async def revoke_all_tokens_for_user(email: str) -> int:
        try:
            # The registry never holds raw tokens, only jti -> expiry pairs.
            jti_registry = await jwt_service.get_all_refresh_tokens_for_user(email)

            if not jti_registry:
                return 0

            revoked_count = 0

            for jti, exp in jti_registry.items():
                if await jwt_service.revoke_token_by_jti(jti, float(exp), email):
                    revoked_count += 1

            return revoked_count

        except Exception:
            logger.error("Error revoking all tokens for user %s:\n%s", email, traceback.format_exc())
            return 0

    @staticmethod
    async def _handle_reuse_detected(
        payload: dict, db: AsyncSession = None, request: Request | None = None
    ) -> None:
        """
        payload is the already-decoded claims of a refresh token whose jti Redis
        shows as already revoked — accepting it directly avoids decoding the
        token a second time, since the caller already did that once to reach
        this point.
        """
        email = payload.get("email")

        if not email:
            logger.warning("Refresh token reuse detected, but no email claim was present")
            return

        revoked_count = await RefreshTokenService.revoke_all_tokens_for_user(email)

        # Logged at a severity that stands out from routine single-token
        # revocations, since this indicates likely token theft rather than an
        # expected rotation.
        logger.critical(
            "Refresh token reuse detected for %s — revoked %d active session(s)",
            email, revoked_count,
        )

        await log_security_event(
            REFRESH_TOKEN_REUSE_DETECTED,
            db,
            user_email=email,
            success=False,
            request=request,
            metadata={"sessions_revoked": revoked_count},
        )


refresh_token_service = RefreshTokenService()
