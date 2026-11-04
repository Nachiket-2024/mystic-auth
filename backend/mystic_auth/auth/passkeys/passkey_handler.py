import asyncio
import hashlib
import hmac
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...audit_log.audit_log_service import (
    LOGIN_IP_LOCKED,
    PASSKEY_LOGIN_FAILURE,
    PASSKEY_LOGIN_SUCCESS,
    PASSKEY_REGISTERED,
    PASSKEY_REGISTRATION_FAILURE,
    PASSKEY_REMOVED,
    PASSKEY_RENAMED,
    log_security_event,
)
from ...auth.login.login_handler import LoginHandler
from ...auth.security.client_ip import get_client_ip, ip_bucket
from ...auth.security.login_protection_service import login_protection_service
from ...auth.token_logic.jwt_service import jwt_service
from ...auth.token_logic.token_cookie_handler import token_cookie_handler
from ...auth.token_logic.token_schema import TokenPairResponseSchema
from ...core.settings import settings
from ...error_monitoring.sentry_service import capture_security_alert
from ...user.user_crud_collector import user_crud
from ...user_session.session_service import session_service
from .passkey_notification_service import notify_passkey_added, notify_passkeys_removed
from .passkey_origin import validated_origin
from .passkey_service import MAX_PASSKEYS_PER_USER, passkey_service


class PasskeyHandler:
    """Registration, passkey sign-in, and list/rename/remove for the caller's own credentials.
    The "confirm it's you" gate lives in passkey_step_up_handler.py."""

    @staticmethod
    def _lock_key(client_ip: str) -> str:
        # <endpoint>:<scope>:<id> is the shape the Rate Limits dashboard parses
        # (and lets a holder of the reset permission reset it). Scope "ip": this counter is per source IP.
        digest = hmac.new(settings.SECRET_KEY.encode("utf-8"), f"passkey\0{ip_bucket(client_ip)}".encode(), hashlib.sha256)
        return f"login_lock:ip:{digest.hexdigest()}"

    async def begin_registration(self, email: str, name: str, db: AsyncSession) -> dict:
        user = await user_crud.get_by_email(email, db)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        clean_name = name.strip()
        if not clean_name:
            raise HTTPException(status_code=422, detail="Passkey name is required")
        if len(await passkey_service.list_credentials(user.id, db)) >= MAX_PASSKEYS_PER_USER:
            raise HTTPException(status_code=409, detail="This account already has the maximum number of passkeys")
        return await passkey_service.registration_options(user, db)

    async def complete_registration(
        self, email: str, name: str, credential: dict, request: Request, db: AsyncSession
    ) -> dict:
        origin = validated_origin(request)
        user = await user_crud.get_by_email(email, db)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        clean_name = name.strip()
        if not clean_name or len(clean_name) > 64:
            raise HTTPException(status_code=422, detail="Invalid passkey registration")
        verified = await passkey_service.finish_registration(user, clean_name, credential, db, origin)
        if not verified:
            await log_security_event(
                PASSKEY_REGISTRATION_FAILURE, db, user_email=user.email, success=False, request=request
            )
            raise HTTPException(status_code=400, detail="Passkey registration could not be verified")
        await log_security_event(
            PASSKEY_REGISTERED, db, user_email=user.email, request=request, metadata={"passkey_name": clean_name}
        )
        await notify_passkey_added(user.email, clean_name)
        return {"detail": "Passkey added"}

    async def begin_authentication(self, db: AsyncSession) -> dict:
        return await passkey_service.authentication_options(db)

    async def complete_authentication(self, credential: dict, request: Request, db: AsyncSession) -> Response:
        origin = validated_origin(request)
        client_ip = get_client_ip(request) or "unknown"
        lock_key = self._lock_key(client_ip)
        max_attempts = login_protection_service.MAX_FAILED_LOGIN_ATTEMPTS_PER_IP
        # Same source-IP throttle idea as password login: repeated failed
        # assertions from one address lock further attempts for a while.
        if await login_protection_service.is_locked(lock_key, max_attempts=max_attempts):
            await log_security_event(LOGIN_IP_LOCKED, db, success=False, request=request)
            return LoginHandler._lockout_response(await login_protection_service.get_remaining_seconds(lock_key))

        user = await passkey_service.finish_authentication(credential, db, origin)
        if user is None:
            await log_security_event(PASSKEY_LOGIN_FAILURE, db, success=False, request=request)
            allowed = await login_protection_service.check_and_record_action(
                lock_key,
                success=False,
                max_attempts=max_attempts,
                lockout_time=login_protection_service.LOGIN_LOCKOUT_TIME_PER_IP,
            )
            if not allowed:
                await log_security_event(LOGIN_IP_LOCKED, db, success=False, request=request)
                await capture_security_alert(
                    LOGIN_IP_LOCKED,
                    metadata={
                        "lock_scope": "passkey_ip",
                        "source_ip": client_ip,
                        "request_id": getattr(request.state, "request_id", ""),
                    },
                )
                return LoginHandler._lockout_response(await login_protection_service.get_remaining_seconds(lock_key))
            raise HTTPException(status_code=401, detail="Passkey sign-in failed")
        await login_protection_service.reset_failed_attempts(lock_key)

        await user_crud.update(user, {"last_login_at": datetime.now(UTC)}, db)
        chain_id = uuid.uuid4().hex
        access_token, refresh_token = await asyncio.gather(
            jwt_service.create_access_token(email=user.email, chain_id=chain_id),
            jwt_service.create_refresh_token(email=user.email, chain_id=chain_id),
        )
        payload = await jwt_service.decode_payload(refresh_token)
        if payload and payload.get("jti") and payload.get("exp"):
            await session_service.create_session(
                db, user.id, payload["jti"], chain_id, payload["exp"], request, user.email
            )
        await log_security_event(PASSKEY_LOGIN_SUCCESS, db, user_email=user.email, request=request)
        return token_cookie_handler.set_tokens_in_cookies(
            Response(content='{"detail":"Signed in"}', media_type="application/json"),
            TokenPairResponseSchema(access_token=access_token, refresh_token=refresh_token),
        )

    async def list_credentials(self, email: str, db: AsyncSession):
        user = await user_crud.get_by_email(email, db)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        rows = await passkey_service.list_credentials(user.id, db)
        return [
            {"id": row.id, "name": row.name, "created_at": row.created_at, "last_used_at": row.last_used_at}
            for row in rows
        ]

    async def rename_credential(self, email: str, credential_id: int, name: str, request: Request, db: AsyncSession):
        user = await user_crud.get_by_email(email, db)
        clean_name = name.strip()
        if user is None or not clean_name:
            raise HTTPException(status_code=422, detail="Invalid passkey name")
        if not await passkey_service.rename_credential(user.id, credential_id, clean_name, db):
            raise HTTPException(status_code=404, detail="Passkey not found")
        await log_security_event(PASSKEY_RENAMED, db, user_email=user.email, request=request)
        return {"detail": "Passkey renamed"}

    async def remove_credential(self, email: str, credential_id: int, request: Request, db: AsyncSession):
        user = await user_crud.get_by_email(email, db)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        if not await passkey_service.remove_credential(user.id, credential_id, db):
            raise HTTPException(status_code=404, detail="Passkey not found")
        await log_security_event(PASSKEY_REMOVED,
            db,
            user_email=user.email,
            request=request,
            metadata={"count": 1, "scope": "single"},
        )
        await notify_passkeys_removed(user.email, 1)
        return {"detail": "Passkey removed"}

    async def remove_credentials(
        self, email: str, credential_ids: list[int] | None, request: Request, db: AsyncSession
    ) -> dict:
        user = await user_crud.get_by_email(email, db)
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        removed = await passkey_service.remove_credentials(user.id, credential_ids, db)
        if removed == 0:
            raise HTTPException(status_code=404, detail="Passkey not found")
        await log_security_event(
            PASSKEY_REMOVED,
            db,
            user_email=user.email,
            request=request,
            metadata={"count": removed, "scope": "all" if credential_ids is None else "selected"},
        )
        await notify_passkeys_removed(user.email, removed)
        return {"detail": "Passkeys removed", "removed": removed}


passkey_handler = PasskeyHandler()
