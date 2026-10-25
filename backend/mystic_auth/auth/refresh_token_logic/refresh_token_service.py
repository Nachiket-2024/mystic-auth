import traceback

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...logging.logging_config import get_logger
from ...user_session.session_service import session_service
from ..security.client_ip import get_client_ip
from ..token_logic.jwt_service import jwt_service
from .refresh_token_revocation import (
    handle_reuse_detected,
    revoke_all_tokens_for_user,
    revoke_all_tokens_for_user_except_chain,
    revoke_chain_for_user,
)

logger = get_logger(__name__)


class RefreshTokenService:
    """Rotates and revokes refresh tokens. Revocation is version-based
    (jwt_service.bump_account_version / bump_chain_version), not identity
    based. See jwt_service.py for the version checks."""

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

            if not jwt_service.has_valid_issuer_and_audience(payload):
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

            # Checked before claiming: a token with a stale account_ver/chain_ver
            # was invalidated by an explicit revoke, not stolen, so this is a
            # quiet rejection, not reuse-detection. Without it, claim_jti_for_rotation
            # alone (which only catches a jti redeemed *twice*) would happily
            # rotate a stale-but-never-used token into a fresh valid session,
            # defeating the revoke that just happened.
            if not await jwt_service.is_current_version(payload):
                return None

            email = payload.get("email")
            chain_id = payload.get("chain")
            account_ver = payload.get("account_ver")
            chain_ver = payload.get("chain_ver")
            if not email or not chain_id or account_ver is None or chain_ver is None:
                return None

            # Refresh tokens are single-use: claim_jti_for_rotation atomically
            # marks this jti redeemed only if it wasn't already. A jti found
            # already claimed being presented again means it was replayed:
            # either the legitimate user retried a stale token, two concurrent
            # requests raced on the same token, or the token was stolen and is
            # being used by an attacker in parallel with its rightful owner.
            # Either way, that is reuse, not a routine invalid-token case.
            client_ip = get_client_ip(request) if request is not None else None
            claim = await jwt_service.claim_jti_for_rotation(
                jti,
                payload.get("exp"),
                email,
                client_ip=client_ip,
                account_ver=int(account_ver),
                chain_ver=int(chain_ver),
            )

            # A same-IP duplicate inside the grace window is likely a browser
            # race. Reject it without triggering reuse revocation, but never
            # issue descendant credentials from a token that already rotated.
            if not claim.claimed:
                if await jwt_service.is_benign_duplicate_rotation(jti, client_ip):
                    logger.info("Duplicate refresh within grace window for jti %s; rejecting retry", jti)
                    return None
                else:
                    await RefreshTokenService._handle_reuse_detected(payload, db, request)
                    return None

            # chain_id carried forward unchanged: this is a continuation of
            # the same login, not a new one, so its version-based identity
            # (and therefore what a future targeted revoke would end) stays
            # intact across the rotation.
            issued_at = claim.consumed_at
            new_access_token = await jwt_service.create_access_token(
                email,
                chain_id,
                issued_at=issued_at,
                account_ver=claim.account_ver,
                chain_ver=claim.chain_ver,
            )
            new_refresh_token = await jwt_service.create_refresh_token(
                email,
                chain_id,
                issued_at=issued_at,
                account_ver=claim.account_ver,
                chain_ver=claim.chain_ver,
            )

            # Best-effort: moves the Manage Sessions row from the old jti
            # (just rotated away above) to the new one, rather than changing
            # create_refresh_token's return shape (see login_service.py's
            # identical comment for why).
            new_payload = await jwt_service.decode_payload(new_refresh_token)
            if not new_payload or not new_payload.get("jti") or not new_payload.get("exp"):
                return None
            # Do not let a refresh racing with logout/reuse detection adopt a
            # newer version written after its parent was validated. Comparing
            # to the parent is essential: checking only that the child is
            # current could mint a valid post-revocation descendant.
            if (
                new_payload.get("account_ver", 0) != claim.account_ver
                or new_payload.get("chain_ver", 0) != claim.chain_ver
                or not await jwt_service.is_current_version(new_payload)
            ):
                return None
            await session_service.rotate_session(
                db, jti, new_payload["jti"], chain_id, new_payload["exp"], email=email, request=request
            )

            return {"access_token": new_access_token, "refresh_token": new_refresh_token}

        except Exception:
            logger.error("Error refreshing token:\n%s", traceback.format_exc())
            return None

    # Revocation (version-bump based) and reuse-detection handling live in
    # refresh_token_revocation.py; re-exposed here as static methods so the
    # public RefreshTokenService/refresh_token_service API is unchanged for
    # every existing caller and test.
    revoke_all_tokens_for_user = staticmethod(revoke_all_tokens_for_user)
    revoke_all_tokens_for_user_except_chain = staticmethod(revoke_all_tokens_for_user_except_chain)
    revoke_chain_for_user = staticmethod(revoke_chain_for_user)
    _handle_reuse_detected = staticmethod(handle_reuse_detected)


refresh_token_service = RefreshTokenService()
