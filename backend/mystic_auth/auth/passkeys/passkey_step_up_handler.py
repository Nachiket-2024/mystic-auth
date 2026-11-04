import math
import traceback
from datetime import UTC, datetime

from fastapi import Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...audit_log.audit_log_service import (
    LOGIN_IP_LOCKED,
    PASSKEY_STEP_UP_FAILURE,
    PASSKEY_STEP_UP_SUCCESS,
    log_security_event,
)
from ...core.errors import AppError
from ...error_monitoring.sentry_service import capture_security_alert
from ...logging.logging_config import get_logger
from ...user.user_crud_collector import user_crud
from ...user.user_model import User
from ...user_session.session_model import UserSession
from ...valkey.client import valkey_client
from ..password_logic.password_service import password_service
from ..security.client_ip import get_client_ip
from ..security.login_protection_service import login_protection_service
from ..security.rate_limiting.account_keys import account_ip_digest
from ..token_logic.jwt_service import jwt_service
from .passkey_origin import validated_origin
from .passkey_service import passkey_service

logger = get_logger(__name__)


class PasskeyStepUpHandler:
    # Step-up ("sudo mode"): changing credentials needs proof of identity
    # within this window. A fresh login counts as that proof, so users who
    # just signed in are never prompted twice.
    STEP_UP_WINDOW_SECONDS = 900

    @staticmethod
    def _step_up_key(chain_id: str) -> str:
        return f"passkey_stepup:{chain_id}"

    @staticmethod
    def _step_up_required() -> AppError:
        return AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code="PASSKEY_STEP_UP_REQUIRED",
            detail="Confirm your identity before changing passkeys.",
        )

    async def _live_session(self, email: str, access_token: str, db: AsyncSession) -> tuple[User, UserSession, str]:
        """The caller's user, session row and token chain, or a step-up error."""
        payload = await jwt_service.decode_payload(access_token)
        chain_id = payload.get("chain") if payload else None
        user = await user_crud.get_by_email(email, db)
        session = None
        if chain_id and user:
            session = await db.scalar(
                select(UserSession).where(
                    UserSession.user_id == user.id,
                    UserSession.chain_id == chain_id,
                    UserSession.revoked_at.is_(None),
                )
            )
        if user is None or session is None or not chain_id:
            raise self._step_up_required()
        return user, session, chain_id

    async def require_step_up(self, email: str, access_token: str, db: AsyncSession) -> None:
        _, session, chain_id = await self._live_session(email, access_token, db)
        cutoff = datetime.now(UTC).timestamp() - self.STEP_UP_WINDOW_SECONDS
        if session.created_at.timestamp() >= cutoff:
            return
        try:
            confirmed = await valkey_client.exists(self._step_up_key(chain_id))
        except Exception:
            logger.error("Passkey step-up lookup failed:\n%s", traceback.format_exc())
            confirmed = 0
        if not confirmed:
            raise self._step_up_required()

    async def _check_step_up_lock(self, lock_key: str, user_email: str, db: AsyncSession, request: Request) -> None:
        if await login_protection_service.is_locked(
            lock_key, max_attempts=login_protection_service.MAX_FAILED_LOGIN_ATTEMPTS_PER_IP
        ):
            await log_security_event(LOGIN_IP_LOCKED, db, user_email=user_email, success=False, request=request)
            raise self._throttled(await login_protection_service.get_remaining_seconds(lock_key))

    @staticmethod
    def _throttled(retry_after_seconds: int) -> AppError:
        error = AppError(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            code="LOGIN_THROTTLED",
            detail="Too many failed confirmation attempts.",
            params={"minutes": max(1, math.ceil(retry_after_seconds / 60))},
        )
        error.headers = {"Retry-After": str(max(1, retry_after_seconds))}
        return error

    async def _fail_step_up(
        self, lock_key: str, user: User, request: Request, db: AsyncSession, error: AppError
    ) -> None:
        await log_security_event(PASSKEY_STEP_UP_FAILURE, db, user_email=user.email, success=False, request=request)
        allowed = await login_protection_service.check_and_record_action(
            lock_key,
            success=False,
            max_attempts=login_protection_service.MAX_FAILED_LOGIN_ATTEMPTS_PER_IP,
            lockout_time=login_protection_service.LOGIN_LOCKOUT_TIME_PER_IP,
        )
        if not allowed:
            await log_security_event(LOGIN_IP_LOCKED, db, user_email=user.email, success=False, request=request)
            await capture_security_alert(
                LOGIN_IP_LOCKED,
                metadata={
                    "lock_scope": "passkey_step_up",
                    "target_email": user.email,
                    "source_ip": get_client_ip(request) or "unknown",
                    "request_id": getattr(request.state, "request_id", ""),
                },
            )
            raise self._throttled(await login_protection_service.get_remaining_seconds(lock_key))
        raise error

    async def record_step_up(self, chain_id: str, user: User, method: str, request: Request, db: AsyncSession) -> None:
        """Unlock passkey changes for this token chain and audit it."""
        try:
            await valkey_client.set(self._step_up_key(chain_id), "1", ex=self.STEP_UP_WINDOW_SECONDS)
        except Exception:
            logger.error("Passkey step-up grant failed:\n%s", traceback.format_exc())
            raise AppError(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                code="SERVICE_UNAVAILABLE",
                detail="Could not record the confirmation. Try again.",
            ) from None
        await log_security_event(
            PASSKEY_STEP_UP_SUCCESS, db, user_email=user.email, request=request, metadata={"method": method}
        )

    async def _grant_step_up(
        self, lock_key: str, user: User, chain_id: str, method: str, request: Request, db: AsyncSession
    ) -> dict:
        await self.record_step_up(chain_id, user, method, request, db)
        await login_protection_service.reset_failed_attempts(lock_key)
        return {"detail": "Confirmed", "expires_in": self.STEP_UP_WINDOW_SECONDS}

    async def google_step_up_context(self, email: str, access_token: str, db: AsyncSession) -> dict[str, str]:
        """What the Google callback needs to unlock this exact session later."""
        user, _, chain_id = await self._live_session(email, access_token, db)
        return {"chain": chain_id, "email": user.email}

    def _step_up_lock_key(self, email: str, request: Request) -> str:
        return f"login_lock:account_ip:{account_ip_digest(email, get_client_ip(request), purpose='stepup')}"

    async def confirm_with_password(
        self, email: str, access_token: str, password: str, request: Request, db: AsyncSession
    ) -> dict:
        user, _, chain_id = await self._live_session(email, access_token, db)
        if user.hashed_password is None:
            raise AppError(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="PASSKEY_STEP_UP_PASSWORD_UNAVAILABLE",
                detail="This account has no password. Confirm with a passkey or sign in again.",
            )
        lock_key = self._step_up_lock_key(user.email, request)
        await self._check_step_up_lock(lock_key, user.email, db, request)
        if not await password_service.verify_password(password, user.hashed_password):
            await self._fail_step_up(
                lock_key,
                user,
                request,
                db,
                AppError(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code="CURRENT_PASSWORD_INCORRECT",
                    detail="Current password is incorrect",
                ),
            )
        return await self._grant_step_up(lock_key, user, chain_id, "password", request, db)

    async def confirm_with_passkey(
        self, email: str, access_token: str, credential: dict, request: Request, db: AsyncSession
    ) -> dict:
        origin = validated_origin(request)
        user, _, chain_id = await self._live_session(email, access_token, db)
        lock_key = self._step_up_lock_key(user.email, request)
        await self._check_step_up_lock(lock_key, user.email, db, request)
        verified = await passkey_service.finish_authentication(credential, db, origin)
        if verified is None or verified.id != user.id:
            await self._fail_step_up(
                lock_key,
                user,
                request,
                db,
                AppError(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    code="PASSKEY_STEP_UP_FAILED",
                    detail="Passkey confirmation failed",
                ),
            )
        return await self._grant_step_up(lock_key, user, chain_id, "passkey", request, db)


passkey_step_up_handler = PasskeyStepUpHandler()
