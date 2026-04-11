# ---------------------------- External Imports ----------------------------
# Traceback module to capture detailed exception stack traces
import traceback

# ---------------------------- Internal Imports ----------------------------
# Password service for creating and verifying tokens, hashing passwords
from .password_service import password_service

# Taskiq async task for sending emails
from ...taskiq_tasks.email_tasks import send_email_task

# Single user CRUD instance for querying the unified users table
from ...user_crud.user_crud_collector import user_crud

# Settings module for frontend URLs and app configuration
from ...core.settings import settings

# Import centralized logger factory to create structured, module-specific loggers
from ...logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- Password Reset Service ----------------------------
# Service class handling password reset requests and updates
class PasswordResetService:
    """
    1. send_reset_email - Generate reset token and schedule email via Taskiq.
    2. reset_password - Validate token, hash new password, and update user in DB.
    """

    # ---------------------------- Send Reset Email ----------------------------
    @staticmethod
    async def send_reset_email(email: str, db) -> bool:
        """
        Input:
            1. email (str): Email of the user requesting password reset.
            2. db (AsyncSession): Database session for verifying user exists.

        Process:
            1. Verify user exists in the unified users table.
            2. Generate password reset token via password_service.
            3. Construct frontend reset URL with the token.
            4. Schedule email sending asynchronously via Taskiq.

        Output:
            1. bool: True if email scheduled successfully, False otherwise.
        """
        try:
            # Step 1: Verify user exists in the unified users table
            user = await user_crud.get_by_email(email, db)
            if not user:
                logger.warning("Password reset requested for non-existent email: %s", email)
                return False

            # Step 2: Generate password reset token via password_service
            # Token carries only email — role is no longer needed for reset flow
            reset_token = await password_service.create_reset_token(email)

            # Step 3: Construct frontend reset URL with the token
            reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password?token={reset_token}"

            # Step 4: Schedule email sending asynchronously via Taskiq
            await send_email_task.kiq(
                to_email=email,
                subject="Password Reset Request",
                body=f"Click the link to reset your password: {reset_url}"
            )

            # Log after successful scheduling
            logger.info("Password reset email scheduled for %s", email)
            return True

        except Exception:
            logger.error("Error sending password reset email:\n%s", traceback.format_exc())
            return False

    # ---------------------------- Reset Password ----------------------------
    @staticmethod
    async def reset_password(token: str, new_password: str, db) -> bool:
        """
        Input:
            1. token (str): Password reset token received from user.
            2. new_password (str): New password provided by user.
            3. db (AsyncSession): Database session for updating user record.

        Process:
            1. Verify the reset token via password_service.
            2. Extract email from token payload.
            3. Check new password strength via password_service.
            4. Hash the new password securely.
            5. Update user's hashed password in the unified users table.

        Output:
            1. bool: True if password was reset successfully, False otherwise.
        """
        try:
            # Step 1: Verify the reset token via password_service
            payload = await password_service.verify_reset_token(token)
            if not payload:
                logger.warning("Invalid or expired password reset token")
                return False

            # Step 2: Extract email from token payload
            # Role is no longer stored in reset tokens — single table makes it unnecessary
            email = payload.get("email")
            if not email:
                logger.warning("Email missing from reset token payload")
                return False

            # Step 3: Check new password strength via password_service
            if not await password_service.validate_password_strength(new_password):
                logger.warning("Weak password provided during reset for email: %s", email)
                return False

            # Step 4: Hash the new password securely
            hashed_password = await password_service.hash_password(new_password)

            # Step 5: Update user's hashed password in the unified users table
            updated = await user_crud.update_by_email(
                email, {"hashed_password": hashed_password}, db
            )

            if updated:
                logger.info("Password reset successful for email: %s", email)
                return True

            return False

        except Exception:
            logger.error("Error during password reset:\n%s", traceback.format_exc())
            return False


# ---------------------------- Service Instance ----------------------------
# Singleton instance for password reset operations across the application
password_reset_service = PasswordResetService()