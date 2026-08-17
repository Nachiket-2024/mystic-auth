import asyncio
import traceback
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.settings import settings
from ..emails.email_template_service import render_transactional_email
from ..logging.logging_config import get_logger
from ..redis.client import redis_client
from ..taskiq_tasks.email_tasks import send_email_task
from ..user_crud.user_crud_collector import user_crud
from .user_self_deletion_service import finalize_self_deletion

logger = get_logger(__name__)


class AccountDeletionService:
    """
    Async, email-confirmed self-service account-deletion flow for
    OAuth-only accounts (hashed_password is None, so there's no password to
    re-confirm with synchronously - see
    user_self_service_routes.py::delete_my_account for the password-holding
    account's unchanged synchronous path). Modeled directly on
    auth/password_logic/password_reset_service.py: a signed, single-use JWT
    e-mailed as a link, redeemed exactly once via Redis GETDEL.
    """

    @staticmethod
    async def create_account_deletion_token(
        email: str,
        expires_minutes: int = settings.ACCOUNT_DELETE_TOKEN_EXPIRE_MINUTES,
    ) -> str:
        expire = datetime.now(UTC) + timedelta(minutes=expires_minutes)

        # The "account_delete" type claim, same purpose as
        # password_service.create_reset_token's "reset" claim: rejects any
        # other validly-signed JWT (an access, refresh, or password-reset
        # token, all sharing the same SECRET_KEY signature) that happens to
        # also carry an "email" claim, so one can never be swapped for
        # another across these otherwise-similar flows.
        payload: dict[str, str | float] = {
            "email": email,
            "type": "account_delete",
            "exp": expire.timestamp(),
        }

        # Off the event loop, same as password_service.create_reset_token:
        # PyJWT's encode is sync.
        return await asyncio.to_thread(jwt.encode, payload, settings.SECRET_KEY, settings.JWT_ALGORITHM)

    @staticmethod
    async def verify_account_deletion_token(token: str) -> dict | None:
        try:
            payload = await asyncio.to_thread(
                jwt.decode, token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
            )

            if not payload.get("email"):
                return None

            if payload.get("type") != "account_delete":
                return None

            return payload

        except jwt.ExpiredSignatureError:
            return None

        except jwt.InvalidTokenError:
            return None

    @staticmethod
    async def send_deletion_email(user, db: AsyncSession) -> bool:
        try:
            email = user.email
            token = await account_deletion_service.create_account_deletion_token(email)

            expires_minutes = settings.ACCOUNT_DELETE_TOKEN_EXPIRE_MINUTES

            # Persisted in Redis so confirm_deletion() can enforce
            # single-use, same rationale as password_reset_service's
            # "password_reset:{token}" key: without this, the JWT's
            # signature alone stays valid (and replayable) for the whole
            # expiry window even after being redeemed once.
            await redis_client.set(f"account_delete:{token}", "1", ex=expires_minutes * 60)

            deletion_url = f"{settings.FRONTEND_BASE_URL}/confirm-delete?token={token}"

            email_subject = "Confirm Account Deletion"
            email_body = render_transactional_email(
                preheader="Confirm you want to permanently delete your account.",
                heading="Confirm Account Deletion",
                # Red, unlike the reset/verification emails' brand color:
                # this is the one transactional email in the app where the
                # action really is irreversible-adjacent (deactivates
                # immediately; the grace-period purge follows the normal
                # soft-delete schedule either way), so it's fine, even
                # useful, for this CTA to visually read as more consequential.
                accent_color="#c53030",
                intro=(
                    "A deletion request was made for your account. Click the button below to "
                    "confirm - your account will be deactivated immediately and signed out "
                    "everywhere, then permanently removed after the standard "
                    f"{settings.ACCOUNT_PURGE_GRACE_DAYS}-day recovery window."
                ),
                cta_label="Confirm Account Deletion",
                cta_url=deletion_url,
                expiry_note=f"This confirmation link will expire in {expires_minutes} minutes for security reasons.",
                ignore_note="If you didn't request this, you can safely ignore this email; your account will remain unchanged.",
            )

            await send_email_task.kiq(
                to_email=email,
                subject=email_subject,
                body=email_body,
                is_html=True,
            )

            logger.info("Account deletion confirmation email scheduled for %s", email)
            return True

        except Exception:
            logger.error("Error sending account deletion confirmation email:\n%s", traceback.format_exc())
            return False

    @staticmethod
    async def confirm_deletion(token: str, db: AsyncSession, request: Request | None = None) -> bool:
        """
        Atomically fetch-and-delete the Redis entry (GETDEL, not GET+DEL), so
        reuse/replay is impossible: two concurrent requests carrying the same
        valid link could otherwise both pass a plain GET before either
        deleted the key, and both then run the (irreversible-ish, session
        revoking) deletion. Same race, same fix, as
        password_reset_service.reset_password. Unlike that flow there's no
        recoverable-validation-failure case worth restoring the token for
        (deletion has no equivalent to "weak new password" or "same as old
        password"): once the token verifies and the Redis entry is
        successfully redeemed, the only remaining failure is "user not
        found", which a retry with the same link can't fix either.
        """
        try:
            payload = await account_deletion_service.verify_account_deletion_token(token)
            if not payload:
                logger.warning("Invalid or expired account deletion token")
                return False

            if not await redis_client.getdel(f"account_delete:{token}"):
                logger.warning("Account deletion token not found or already used")
                return False

            email = payload.get("email")
            if not email:
                logger.warning("Email missing from account deletion token payload")
                return False

            user = await user_crud.get_by_email(email, db)
            if not user:
                logger.warning("User not found during account deletion confirm for email: %s", email)
                return False

            await finalize_self_deletion(user, db, request=request)

            logger.info("Account deletion confirmed for email: %s", email)
            return True

        except Exception:
            logger.error("Error during account deletion confirm:\n%s", traceback.format_exc())
            return False


account_deletion_service = AccountDeletionService()
