import traceback

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

# Refresh token reuse is likely theft, not a routine expired/invalid refresh:
# see _handle_reuse_detected.
from ...audit_log.audit_log_service import REFRESH_TOKEN_REUSE_DETECTED, log_security_event
from ...logging.logging_config import get_logger
from ...user_session.session_events import publish_session_revoked
from ...user_session.session_service import session_service
from ..token_logic.jwt_service import jwt_service

logger = get_logger(__name__)


class RefreshTokenService:
    """Rotates and revokes refresh tokens. Revocation is version-based
    (jwt_service.bump_account_version / bump_chain_version), not identity-
    based - see jwt_service.py's own docstring."""

    @staticmethod
    async def refresh_tokens(
        refresh_token: str, db: AsyncSession | None = None, request: Request | None = None
    ) -> dict[str, str] | None:
        try:
            # Decoded once and threaded through the rest of this method, since a
            # previous version decoded the same token up to three separate times.
            # This is the busiest endpoint in the auth system (every refresh happens on every
            # access-token expiry, for every session), so that redundant work mattered.
            payload = await jwt_service.decode_payload(refresh_token)

            if not payload:
                return None

            jti = payload.get("jti")
            if not jti:
                logger.warning("Refresh token payload missing 'jti' claim")
                return None

            # Type is checked before the token is ever claimed/revoked below:
            # a wrong-type token (e.g. an access token mistakenly presented
            # here) must be rejected without side effects, never burned as if
            # it were a real refresh token.
            if payload.get("type") != "refresh":
                logger.warning(
                    "Token type mismatch during refresh: expected 'refresh', got '%s'",
                    payload.get("type"),
                )
                return None

            # Checked before claiming: a token whose embedded account_ver/
            # chain_ver has already fallen behind was invalidated by an
            # explicit revoke (logout-all, a password change, a targeted
            # Manage Sessions revoke) - simply stale, not evidence of theft,
            # so this is a quiet rejection, not reuse-detection. Without
            # this check, claim_jti_for_rotation alone (which only catches a
            # jti being redeemed *twice*) would happily rotate a stale-but-
            # never-yet-used refresh token into a brand new, fully valid
            # session, defeating the whole point of the revoke that just
            # happened.
            if not await jwt_service.is_current_version(payload):
                return None

            # Refresh tokens are single-use: claim_jti_for_rotation atomically
            # marks this jti redeemed only if it wasn't already. A jti found
            # already claimed being presented again means it was replayed:
            # either the legitimate user retried a stale token, two concurrent
            # requests raced on the same token, or the token was stolen and is
            # being used by an attacker in parallel with its rightful owner.
            # Either way, that's reuse - handled below, not treated as a
            # routine invalid-token case.
            claimed = await jwt_service.claim_jti_for_rotation(jti, payload.get("exp"), payload.get("email"))
            if not claimed:
                await RefreshTokenService._handle_reuse_detected(payload, db, request)
                return None

            email = payload.get("email")
            chain_id = payload.get("chain")

            if not email or not chain_id:
                return None

            # chain_id carried forward unchanged: this is a continuation of
            # the same login, not a new one, so its version-based identity
            # (and therefore what a future targeted revoke would end) stays
            # intact across the rotation.
            new_access_token = await jwt_service.create_access_token(email, chain_id)
            new_refresh_token = await jwt_service.create_refresh_token(email, chain_id)

            # Best-effort: moves the Manage Sessions row from the old jti
            # (just rotated away above) to the new one, rather than changing
            # create_refresh_token's return shape (see login_service.py's
            # identical comment for why).
            new_payload = await jwt_service.decode_payload(new_refresh_token)
            if new_payload and new_payload.get("jti") and new_payload.get("exp"):
                await session_service.rotate_session(
                    db, jti, new_payload["jti"], chain_id, new_payload["exp"], email=email, request=request
                )

            return {"access_token": new_access_token, "refresh_token": new_refresh_token}

        except Exception:
            logger.error("Error refreshing token:\n%s", traceback.format_exc())
            return None

    @staticmethod
    async def revoke_all_tokens_for_user(email: str, db: AsyncSession | None = None) -> int:
        """The whole-account revoke: logout-all, password change, account
        deactivation/purge. One O(1) version bump invalidates every token
        on the account immediately - no per-token iteration needed, unlike
        the per-jti registry this replaced.

        Returns how many sessions were active immediately before the bump
        (from the best-effort Postgres mirror, 0 if `db` wasn't given),
        purely for the caller's own audit/UX purposes (e.g. logout-all's
        "Logged out from N devices" message) - the revoke itself doesn't
        need this number."""
        try:
            active_count = await session_service.count_active_sessions(db, email)

            await jwt_service.bump_account_version(email)
            await session_service.revoke_all_sessions(db, email)
            await publish_session_revoked(email)

            return active_count

        except Exception:
            logger.error("Error revoking all tokens for user %s:\n%s", email, traceback.format_exc())
            return 0

    @staticmethod
    async def revoke_chain_for_user(email: str, chain_id: str, db: AsyncSession | None = None) -> None:
        """The single-session revoke: a targeted Manage Sessions "End
        session" goes through session_service.revoke_one_session directly
        (it already has the session_id), but reuse-detection (below) and
        anywhere else that only has a chain_id, not a session_id, comes
        through here. Bumps only that one chain's version - every other
        session on the account, including one from a completely
        independent login that happens to exist right now, is untouched."""
        try:
            await jwt_service.bump_chain_version(email, chain_id)
            await session_service.revoke_chain(db, chain_id)
            await publish_session_revoked(email)
        except Exception:
            logger.error(
                "Error revoking chain %s for user %s:\n%s", chain_id, email, traceback.format_exc()
            )

    @staticmethod
    async def _handle_reuse_detected(
        payload: dict, db: AsyncSession | None = None, request: Request | None = None
    ) -> None:
        """
        payload is the already-decoded claims of a refresh token whose jti
        was already claimed (see claim_jti_for_rotation). Accepting it
        directly avoids decoding the token a second time, since the caller
        already did that once to reach this point.
        """
        email = payload.get("email")

        if not email:
            logger.warning("Refresh token reuse detected, but no email claim was present")
            return

        chain_id = payload.get("chain")
        if chain_id:
            # Scoped: only the compromised chain (this reused token's own
            # lineage) is revoked - see revoke_chain_for_user's docstring.
            await RefreshTokenService.revoke_chain_for_user(email, chain_id, db)
            revoked_description = f"chain {chain_id}"
        else:
            # A pre-upgrade token minted with no "chain" claim: lineage is
            # unknown, so fall back to the account-wide, maximally-safe response.
            await RefreshTokenService.revoke_all_tokens_for_user(email, db)
            revoked_description = "the whole account (no chain claim)"

        # Logged at a severity that stands out from routine single-token
        # revocations, since this indicates likely token theft rather than an
        # expected rotation.
        logger.critical("Refresh token reuse detected for %s, revoked %s", email, revoked_description)

        await log_security_event(
            REFRESH_TOKEN_REUSE_DETECTED,
            db,
            user_email=email,
            success=False,
            request=request,
            metadata={"chain_id": chain_id} if chain_id else {"scope": "account"},
        )


refresh_token_service = RefreshTokenService()
