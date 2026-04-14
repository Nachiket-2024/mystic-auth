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
    2. reset_password - Validate token, check password not same as old, hash new password, and update user in DB.
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
            4. Schedule email sending asynchronously via Taskiq with professional HTML template.

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
            
            # Get token expiration time from settings
            expires_minutes = settings.RESET_TOKEN_EXPIRE_MINUTES

            # Step 3: Construct frontend reset URL with the token
            reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password?token={reset_token}"

            # Step 4: Schedule email sending asynchronously via Taskiq with professional HTML template
            # Professional email subject line
            email_subject = "Reset Your Password"
            
            # Professional HTML email body with responsive design and expiration time
            email_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #2c3e50; border-bottom: 2px solid #e53e3e; padding-bottom: 10px;">Welcome to Full Stack Template</h2>
                    
                    <p style="font-size: 16px;">Hello,</p>
                    
                    <p style="font-size: 16px;">A password reset was requested for your account. Click the button below to create a new password:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{reset_url}" 
                           style="background-color: #e53e3e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                            Reset Your Password
                        </a>
                    </div>
                    
                    <p style="font-size: 14px; color: #666666;">If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="font-size: 14px; color: #e53e3e; word-break: break-all;">{reset_url}</p>
                    
                    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                    
                    <p style="font-size: 12px; color: #999999;">This password reset link will expire in <strong>{expires_minutes} minutes</strong> for security reasons.</p>
                    
                    <p style="font-size: 12px; color: #999999;">If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
                    
                    <p style="font-size: 14px; color: #666666;">Best regards,<br>The Full Stack Template Team</p>
                </div>
            </body>
            </html>
            """

            await send_email_task.kiq(
                to_email=email,
                subject=email_subject,
                body=email_body,
                is_html=True
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
            4. Verify new password is not the same as the old password.
            5. Hash the new password securely.
            6. Update user's hashed password in the unified users table.

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

            # Step 4: Get the user to check if new password is same as old
            user = await user_crud.get_by_email(email, db)
            if not user:
                logger.warning("User not found during password reset for email: %s", email)
                return False

            # Step 5: Verify new password is not the same as the old password
            if user.hashed_password:
                is_same_password = await password_service.verify_password(
                    new_password, user.hashed_password
                )
                if is_same_password:
                    logger.warning("Password reset attempted with same password for email: %s", email)
                    return False

            # Step 6: Hash the new password securely
            hashed_password = await password_service.hash_password(new_password)

            # Step 7: Update user's hashed password in the unified users table
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