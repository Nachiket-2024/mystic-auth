import hashlib
import hmac
import math
import traceback

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...audit_log.audit_log_service import LOGIN_FAILURE, LOGIN_IP_LOCKED, LOGIN_SUCCESS, log_security_event
from ...core.settings import settings
from ...error_monitoring.sentry_service import capture_security_alert
from ...logging.logging_config import get_logger
from ..security.login_protection_service import login_protection_service
from ..token_logic.token_cookie_handler import token_cookie_handler
from ..token_logic.token_schema import TokenPairResponseSchema
from .login_service import login_service

logger = get_logger(__name__)


class LoginHandler:
    """Validates input, authenticates the user, applies login protection, and sets JWT cookies."""

    @staticmethod
    def _lock_key(email: str, client_ip: str) -> str:
        pair = f"{email.strip().casefold()}\0{client_ip}".encode()
        digest = hmac.new(settings.SECRET_KEY.encode("utf-8"), pair, hashlib.sha256).hexdigest()
        return f"login_lock:account_ip:{digest}"

    @staticmethod
    def _lockout_response(retry_after_seconds: int) -> JSONResponse:
        # Shared by the pre-auth and post-auth lockout checks so they can't
        # drift. Surfaces retry_after_seconds two ways: the standard
        # `Retry-After` header (RFC 9110) for tooling, and `params.minutes`
        # in the body for the login form's translated message. Rounded up,
        # never to 0, so "3 seconds left" still reads as "wait a minute."
        retry_after_seconds = max(1, retry_after_seconds)
        retry_after_minutes = math.ceil(retry_after_seconds / 60)
        response = JSONResponse(
            content={
                "error": "Too many failed login attempts. Login is temporarily throttled.",
                "code": "LOGIN_THROTTLED",
                "params": {"minutes": retry_after_minutes},
            },
            status_code=429,
        )
        response.headers["Retry-After"] = str(retry_after_seconds)
        return response

    async def handle_login(
        self,
        email: str,
        password: str,
        client_ip: str = "unknown",
        db: AsyncSession | None = None,
        request: Request | None = None,
    ):
        """
        Failed-attempt throttling is scoped to an account and source-IP pair.
        Failures against one account do not consume another VPN user's budget.
        The route's general per-IP rate limit remains the aggregate cap.
        """
        try:
            if not email or not password:
                return JSONResponse(
                    content={"error": "Email and password are required", "code": "EMAIL_PASSWORD_REQUIRED"},
                    status_code=400,
                )

            lock_key = self._lock_key(email, client_ip)

            # Reject an abusive account/source pair before spending effort on
            # a DB lookup and password hash comparison.
            if await login_protection_service.is_locked(
                lock_key, max_attempts=login_protection_service.MAX_FAILED_LOGIN_ATTEMPTS_PER_IP
            ):
                await log_security_event(
                    LOGIN_IP_LOCKED, db, user_email=email, success=False, request=request
                )
                return self._lockout_response(
                    await login_protection_service.get_remaining_seconds(lock_key)
                )

            tokens: TokenPairResponseSchema | None = await login_service.login(
                email=email, password=password, db=db, request=request
            )

            success = tokens is not None

            # Audit entry for the credential-check outcome, independent of any
            # lockout state applied afterwards.
            await log_security_event(
                LOGIN_SUCCESS if success else LOGIN_FAILURE,
                db,
                user_email=email,
                success=success,
                request=request,
            )

            lock_allowed = await login_protection_service.check_and_record_action(
                lock_key,
                success=success,
                max_attempts=login_protection_service.MAX_FAILED_LOGIN_ATTEMPTS_PER_IP,
                lockout_time=login_protection_service.LOGIN_LOCKOUT_TIME_PER_IP,
            )

            if not lock_allowed:
                await log_security_event(
                    LOGIN_IP_LOCKED, db, user_email=email, success=False, request=request
                )
                await capture_security_alert(
                    LOGIN_IP_LOCKED,
                    metadata={
                        "lock_scope": "account_ip",
                        "target_email": email,
                        "source_ip": client_ip,
                        "request_id": getattr(request.state, "request_id", "") if request else "",
                    },
                )
                return self._lockout_response(
                    await login_protection_service.get_remaining_seconds(lock_key)
                )

            if not tokens:
                return JSONResponse(
                    content={"error": "Invalid credentials", "code": "INVALID_CREDENTIALS"},
                    status_code=401,
                )

            response = JSONResponse(content={"message": "Login successful"})
            return token_cookie_handler.set_tokens_in_cookies(response, tokens)

        except Exception:
            logger.error("Error during login:\n%s", traceback.format_exc())
            return JSONResponse(
                content={"error": "Internal Server Error", "code": "INTERNAL_SERVER_ERROR"}, status_code=500
            )


login_handler = LoginHandler()
