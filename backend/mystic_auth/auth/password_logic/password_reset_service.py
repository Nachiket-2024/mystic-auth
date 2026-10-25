import hashlib
import hmac
import traceback
from datetime import UTC, datetime

from ...core.settings import settings
from ...emails.email_template_service import render_transactional_email
from ...logging.logging_config import get_logger
from ...procrastinate_tasks.email_tasks import send_email_task
from ...user.user_crud_collector import user_crud
from ...valkey.client import valkey_client
from ..refresh_token_logic.refresh_token_service import refresh_token_service
from ..token_logic.token_version_store import TokenVersionUnavailableError
from .password_service import password_service

logger = get_logger(__name__)

_STORE_RESET_TOKEN_SCRIPT = """
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], '1', 'EX', ARGV[2])
return 1
"""
_CONSUME_RESET_TOKEN_SCRIPT = """
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if redis.call('GET', KEYS[2]) ~= '1' then return 0 end
redis.call('DEL', KEYS[1], KEYS[2])
return 1
"""
_RESTORE_RESET_TOKEN_SCRIPT = """
local active = redis.call('GET', KEYS[1])
if active and active ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], '1', 'EX', ARGV[2])
return 1
"""


class PasswordResetService:
    """Handles password reset requests (email dispatch) and reset confirmation."""

    @staticmethod
    def _active_token_key(email: str) -> str:
        normalized = email.strip().casefold().encode("utf-8")
        digest = hmac.new(settings.SECRET_KEY.encode("utf-8"), normalized, hashlib.sha256).hexdigest()
        return f"password_reset_active:{digest}"

    @staticmethod
    async def store_reset_token(email: str, token: str, expires_seconds: int) -> bool:
        payload = await password_service.verify_reset_token(token)
        if not payload or not isinstance(payload.get("jti"), str) or not payload["jti"]:
            return False
        await valkey_client.eval(
            _STORE_RESET_TOKEN_SCRIPT,
            2,
            PasswordResetService._active_token_key(email),
            f"password_reset:{payload['jti']}",
            payload["jti"],
            expires_seconds,
        )
        return True

    @staticmethod
    async def send_reset_email(email: str, db) -> bool:
        try:
            user = await user_crud.get_by_email(email, db)
            if not user:
                logger.warning("Password reset requested for non-existent email: %s", email)
                return False

            # Token carries only email; role is no longer needed for reset flow.
            reset_token = await password_service.create_reset_token(email)

            expires_minutes = settings.RESET_TOKEN_EXPIRE_MINUTES

            # Keep only the newest outstanding reset id for an account.
            # Lua makes replacement of the active id and insertion of its
            # single-use marker one atomic operation.
            if not await PasswordResetService.store_reset_token(
                email, reset_token, expires_minutes * 60
            ):
                raise ValueError("New password-reset token is missing its unique identifier")

            # Fragment values are never sent in HTTP requests or Referer
            # headers. The frontend consumes and scrubs the fragment in memory.
            reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password#token={reset_token}"

            email_subject = "Reset Your Password"
            email_body = render_transactional_email(
                preheader="Reset your password to regain access to your account.",
                heading="Reset Your Password",
                # brand.600 (see account_verification_service.py's identical
                # comment), not red: an alarming red CTA on a password-reset
                # email is a classic phishing-email pattern, the opposite of
                # what a legitimate one should look like, and every other
                # transactional email in the app already uses this same
                # brand color - no reason for this one to look like a
                # different product.
                accent_color="#2c7a7b",
                intro="A password reset was requested for your account. Click the button below to create a new password.",
                cta_label="Reset Your Password",
                cta_url=reset_url,
                expiry_note=f"This password reset link will expire in {expires_minutes} minutes for security reasons.",
                ignore_note="If you didn't request a password reset, you can safely ignore this email; your password will remain unchanged.",
            )

            await send_email_task.defer_async(
                to_email=email,
                subject=email_subject,
                body=email_body,
                is_html=True
            )

            logger.info("Password reset email scheduled for %s", email)
            return True

        except Exception:
            logger.error("Error sending password reset email:\n%s", traceback.format_exc())
            return False

    @staticmethod
    async def reset_password(token: str, new_password: str, db) -> tuple[bool, bool | None]:
        """
        The single-use check used to be a plain GET, with the matching DELETE
        only issued after a successful password update, leaving a window where
        two concurrent requests carrying the same valid token could both pass
        the GET before either deleted the key. If they submitted different new
        passwords, both DB writes would execute and the later one would
        silently win, defeating the token's single-use guarantee. One Lua
        operation verifies that the token is still the account's newest
        outstanding reset and consumes it atomically: only one concurrent
        request can win, and an older link fails even when its JWT has not
        expired. A request that wins but then fails a recoverable validation
        step (weak password, same-as-old password, transient DB failure)
        restores the entry only if no newer link has since been issued, with a
        TTL capped by the JWT's remaining lifetime.

        Returns (success, sessions_revoked). success is False only for an
        actual reset failure (bad/expired/reused token, weak password, no
        such user, same password); once the new password is actually
        written, success is always True, even if the other-session revoke
        below couldn't be confirmed - blocking the reset on an unrelated
        Postgres outage would be worse than the gap it protects against.
        sessions_revoked is None when no revoke was attempted (the reset
        itself failed first), True once confirmed, False if Valkey was
        unreachable for the bump - same contract as the self-service
        password-change path's own sessions_revoked field
        (user_self_service_routes.py), so a Postgres outage never turns a real
        password reset into a reported "invalid token" failure.
        """
        valkey_key: str | None = None
        active_key: str | None = None

        async def _restore_token(payload: dict) -> None:
            # Cap the restored TTL at the token's own remaining JWT lifetime so
            # retries never extend the reset window past the original expiry;
            # verify_reset_token would reject the JWT by then anyway.
            exp = payload.get("exp")
            if not exp:
                return
            remaining = int(exp - datetime.now(UTC).timestamp())
            if remaining > 0 and valkey_key and active_key:
                await valkey_client.eval(
                    _RESTORE_RESET_TOKEN_SCRIPT,
                    2,
                    active_key,
                    valkey_key,
                    payload["jti"],
                    remaining,
                )

        try:
            payload = await password_service.verify_reset_token(token)
            if not payload:
                logger.warning("Invalid or expired password reset token")
                return False, None

            jti = payload.get("jti")
            email = payload.get("email")
            # Older reset JWTs without a unique id cannot participate in the
            # one-active-link contract and are rejected.
            if not isinstance(jti, str) or not jti or not isinstance(email, str) or not email:
                return False, None
            valkey_key = f"password_reset:{jti}"
            active_key = PasswordResetService._active_token_key(email)

            # Atomically verify that this is still the newest link and consume
            # it. This closes the check/rotate race as well as replay.
            if not await valkey_client.eval(
                _CONSUME_RESET_TOKEN_SCRIPT, 2, active_key, valkey_key, jti
            ):
                logger.warning("Password reset token not found or already used")
                return False, None

            # Role is no longer stored in reset tokens: single table makes it unnecessary.
            if not await password_service.validate_password_strength(new_password):
                logger.warning("Weak password provided during reset for email: %s", email)
                await _restore_token(payload)
                return False, None

            user = await user_crud.get_by_email(email, db)
            if not user:
                logger.warning("User not found during password reset for email: %s", email)
                await _restore_token(payload)
                return False, None

            if user.hashed_password:
                is_same_password = await password_service.verify_password(
                    new_password, user.hashed_password
                )
                if is_same_password:
                    logger.warning("Password reset attempted with same password for email: %s", email)
                    await _restore_token(payload)
                    return False, None

            hashed_password = await password_service.hash_password(new_password)

            updated = await user_crud.update_by_email(
                email, {"hashed_password": hashed_password}, db
            )

            if not updated:
                await _restore_token(payload)
                return False, None

            # A password reset is frequently done specifically because the
            # account may be compromised, so any session an attacker already
            # holds must not survive it.
            sessions_revoked = True
            try:
                await refresh_token_service.revoke_all_tokens_for_user(email, db)
            except TokenVersionUnavailableError:
                sessions_revoked = False
                logger.error("Could not confirm session revocation on password reset for %s", email)

            logger.info("Password reset successful for email: %s", email)
            return True, sessions_revoked

        except Exception:
            logger.error("Error during password reset:\n%s", traceback.format_exc())
            return False, None


password_reset_service = PasswordResetService()
