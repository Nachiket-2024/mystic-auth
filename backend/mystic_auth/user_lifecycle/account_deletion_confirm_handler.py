import traceback

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.security.login_protection_service import login_protection_service
from ..logging.logging_config import get_logger
from .account_deletion_service import account_deletion_service

logger = get_logger(__name__)


class AccountDeletionConfirmHandler:
    """Verifies an account-deletion token, runs the shared soft-delete +
    revoke-sessions + audit sequence, and enforces login-lockout-style rate
    limiting on its own namespace. Same shape as
    password_reset_confirm_handler.py."""

    def __init__(self):
        self.account_deletion_service = account_deletion_service
        self.login_protection_service = login_protection_service

    async def handle_confirm_delete(self, token: str, db: AsyncSession, request: Request | None = None) -> JSONResponse:
        try:
            # Must scope to type=="account_delete" here, not a generic
            # verify_token: any validly-signed JWT with an "email" claim (an
            # access/refresh/reset token) would otherwise pass, letting an
            # attacker holding one for a victim account poison their audit
            # log and trip their delete-confirm lockout.
            payload = await self.account_deletion_service.verify_account_deletion_token(token)

            if not payload or "email" not in payload:
                return JSONResponse(
                    {"error": "Invalid or expired token", "code": "INVALID_OR_EXPIRED_DELETE_TOKEN"},
                    status_code=400,
                )

            email = payload["email"]

            # Distinct namespace from login's "login_lock:email:" key and
            # from "password_reset_confirm_lock:email:" - sharing either
            # would mean failures unrelated to a real login attempt (a
            # stale/reused deletion link) count towards, and can trip, an
            # unrelated lockout for the same email. Same reasoning as
            # password_reset_confirm_handler's own separate namespace.
            email_lock_key = f"account_delete_confirm_lock:email:{email}"

            success = await self.account_deletion_service.confirm_deletion(token, db, request=request)

            allowed = await self.login_protection_service.check_and_record_action(
                email_lock_key, success=success
            )

            if not allowed:
                return JSONResponse(
                    {"error": "Too many failed attempts, temporarily locked", "code": "ACCOUNT_LOCKED"},
                    status_code=429,
                )

            if not success:
                return JSONResponse(
                    {"error": "Invalid or expired token", "code": "INVALID_OR_EXPIRED_DELETE_TOKEN"},
                    status_code=400,
                )

            resp = JSONResponse({"message": "Your account has been deleted"}, status_code=200)

            # Clears this browser's auth cookies too, in case the link was
            # opened in the same session that requested the deletion (it
            # doesn't have to be - the token itself is the proof of intent,
            # same trust model as password-reset-confirm). Harmless no-op
            # otherwise. Same cookie shape as logout_handler.py: refresh_token
            # needs path="/auth" to match how token_cookie_handler.py set it.
            resp.delete_cookie(key="access_token", httponly=True, secure=True, samesite="none")
            resp.delete_cookie(key="refresh_token", httponly=True, secure=True, samesite="none", path="/auth")

            return resp

        except Exception:
            logger.error("Error during account deletion confirm logic:\n%s", traceback.format_exc())
            return JSONResponse({"error": "Internal Server Error", "code": "INTERNAL_SERVER_ERROR"}, status_code=500)


account_deletion_confirm_handler = AccountDeletionConfirmHandler()
