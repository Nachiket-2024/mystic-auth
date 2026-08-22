import traceback

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...audit_log.audit_log_service import LOGOUT, log_security_event
from ...logging.logging_config import get_logger
from ...user_session.session_service import session_service
from ..token_logic.jwt_service import jwt_service
from ..token_logic.token_cookie_handler import token_cookie_handler

logger = get_logger(__name__)


class LogoutHandler:
    """Ends exactly the caller's own current session (bumps its chain's
    Redis version - see session_service.revoke_session_on_logout), clears
    auth cookies, and returns the logout response."""

    async def handle_logout(
        self, refresh_token: str | None, db: AsyncSession | None = None, request: Request | None = None
    ) -> JSONResponse:
        try:
            if not refresh_token:
                return JSONResponse(
                    content={"error": "No refresh token cookie found", "code": "NO_REFRESH_TOKEN_COOKIE"},
                    status_code=400
                )

            # decode_payload, not verify_token: an already-revoked/expired
            # refresh token must still resolve to its owning email so the
            # audit trail records who logged out, instead of silently
            # falling back to None (see logout_all_handler.py's identical
            # reasoning for why decode_payload specifically).
            payload = await jwt_service.decode_payload(refresh_token)
            email = payload.get("email") if payload and payload.get("type") == "refresh" else None
            jti = payload.get("jti") if payload and payload.get("type") == "refresh" else None

            session_revoked = await session_service.revoke_session_on_logout(db, jti, email)

            await log_security_event(
                LOGOUT,
                db,
                user_email=email,
                success=bool(email),
                request=request,
                metadata=None if session_revoked else {"session_revoked": False},
            )

            # Succeeds regardless of whether the token was still live to revoke
            # (it may already be invalid, e.g. killed by a recent password
            # change): the caller's actual goal, no valid session left in this
            # browser, is met either way. Erroring here instead would leave the
            # frontend stuck "logged in" with a dead cookie it could never clear.
            # session_revoked=False (Redis was unreachable) still returns 200
            # for the same reason, but is carried in the body rather than
            # silently dropped, so the leaked-token risk isn't invisible.
            resp = JSONResponse(
                content={"message": "Logged out successfully", "session_revoked": session_revoked},
                status_code=200
            )

            token_cookie_handler.clear_tokens_from_cookies(resp)

            return resp

        except Exception:
            logger.error("Error during logout logic:\n%s", traceback.format_exc())
            return JSONResponse(
                content={"error": "Internal Server Error", "code": "INTERNAL_SERVER_ERROR"},
                status_code=500
            )


logout_handler = LogoutHandler()
