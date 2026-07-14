import traceback

from ...core.settings import settings
from ...taskiq_tasks.email_tasks import send_email_task
from ...emails.email_template_service import render_transactional_email
from ...redis.client import redis_client
from ...auth.token_logic.jwt_service import jwt_service
from ...logging.logging_config import get_logger

logger = get_logger(__name__)


class AccountVerificationService:
    """Manages account verification emails and single-use verification tokens."""

    @staticmethod
    async def send_verification_email(
        email: str,
        expires_minutes: int = settings.RESET_TOKEN_EXPIRE_MINUTES
    ) -> bool:
        try:
            verification_token = await AccountVerificationService.create_verification_token(
                email, expires_minutes
            )

            # Stored in Redis to enforce single-use.
            await redis_client.set(
                f"verify:{verification_token}",
                "1",
                ex=expires_minutes * 60
            )

            verify_url = f"{settings.FRONTEND_BASE_URL}/verify-account?token={verification_token}"

            email_subject = "Verify Your Email Address"
            email_body = render_transactional_email(
                preheader="Verify your email address to activate your account.",
                heading="Verify Your Email Address",
                accent_color="#3498db",
                intro="Thanks for signing up. Please confirm this is your email address by clicking the button below.",
                cta_label="Verify Email Address",
                cta_url=verify_url,
                expiry_note=f"This verification link will expire in {expires_minutes} minutes for security reasons.",
                ignore_note="If you didn't create an account with us, you can safely ignore this email.",
            )

            await send_email_task.kiq(
                to_email=email,
                subject=email_subject,
                body=email_body
            )

            logger.info("Verification email scheduled for %s", email)

            return True

        except Exception:
            logger.error("Error sending verification email:\n%s", traceback.format_exc())
            return False

    @staticmethod
    async def create_verification_token(
        email: str,
        expires_minutes: int = settings.RESET_TOKEN_EXPIRE_MINUTES
    ) -> str:
        # Role is hardcoded to "verify" — this token is only valid for email
        # confirmation, not for accessing any protected routes.
        return await jwt_service.create_access_token(email=email, role="verify")

    @staticmethod
    async def verify_token(token: str) -> dict | None:
        try:
            # expected_type="access" because create_verification_token issues
            # these via create_access_token — this stops a stolen refresh token
            # from ever being accepted here, on top of the role="verify" check below.
            payload = await jwt_service.verify_token(token, expected_type="access")
            if not payload:
                return None

            # The only role create_verification_token ever issues — enforcing
            # it means a token minted for any other purpose can never be
            # replayed against this endpoint even if it happened to carry a
            # matching type/email.
            if payload.get("role") != "verify":
                logger.warning("Verification token rejected: unexpected role claim")
                return None

            # Atomically check-and-delete via GETDEL, so a valid token can be
            # consumed exactly once even under concurrent requests. A separate
            # GET-then-DELETE has a TOCTOU race: two concurrent requests can
            # both pass the GET before either runs the DELETE, both treating a
            # single-use token as valid. password_reset_service.py already
            # fixed this same class of bug the same way.
            exists = await redis_client.getdel(f"verify:{token}")
            if not exists:
                logger.warning("Verification token not found or already used")
                return None

            return payload

        except Exception:
            logger.error("Error verifying account verification token:\n%s", traceback.format_exc())
            return None


account_verification_service = AccountVerificationService()
