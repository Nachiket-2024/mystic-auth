# ---------------------------- External Imports ----------------------------
# Capture full exception stack traces for debugging
import traceback

# ---------------------------- Internal Imports ----------------------------
# Application settings including frontend URL and token expirations
from ...core.settings import settings

# Taskiq async task for sending emails
from ...taskiq_tasks.email_tasks import send_email_task

# Async Redis client for token storage and single-use verification
from ...redis.client import redis_client

# JWT service for encoding/decoding and validation
from ...auth.token_logic.jwt_service import jwt_service

# Import centralized logger factory to create structured, module-specific loggers
from ...logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- Account Verification Service Class ----------------------------
# Service for managing account verification emails and single-use tokens
class AccountVerificationService:
    """
    1. send_verification_email - Generate a token, store in Redis, and send email via Taskiq.
    2. create_verification_token - Generate JWT token via JWTService.
    3. verify_token - Validate verification token and enforce single-use.
    """

    # ---------------------------- Send Verification Email ----------------------------
    @staticmethod
    async def send_verification_email(
        email: str,
        expires_minutes: int = settings.RESET_TOKEN_EXPIRE_MINUTES
    ) -> bool:
        """
        Input:
            1. email (str): Recipient's email address.
            2. expires_minutes (int): Token expiration in minutes.

        Process:
            1. Generate verification token for user with expiration.
            2. Store token in Redis to enforce single-use.
            3. Build frontend verification URL with token.
            4. Schedule asynchronous email task via Taskiq with professional HTML template.
            5. Return true if email scheduled successfully.

        Output:
            1. bool: True if email scheduled successfully, False otherwise.
        """
        try:
            # Step 1: Generate verification token for user with expiration
            verification_token = await AccountVerificationService.create_verification_token(
                email, expires_minutes
            )

            # Step 2: Store token in Redis to enforce single-use
            await redis_client.set(
                f"verify:{verification_token}",
                "1",
                ex=expires_minutes * 60
            )

            # Step 3: Build frontend verification URL with token
            verify_url = f"{settings.FRONTEND_BASE_URL}/verify-account?token={verification_token}"

            # Step 4: Schedule asynchronous email task via Taskiq with professional HTML template
            # Professional email subject line
            email_subject = "Verify Your Email Address"
            
            # Professional HTML email body with responsive design
            email_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Welcome to Full Stack Template</h2>
                    
                    <p style="font-size: 16px;">Hello,</p>
                    
                    <p style="font-size: 16px;">Thank you for registering with us. Please verify your email address by clicking the button below:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{verify_url}" 
                           style="background-color: #3498db; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
                            Verify Email Address
                        </a>
                    </div>
                    
                    <p style="font-size: 14px; color: #666666;">If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="font-size: 14px; color: #3498db; word-break: break-all;">{verify_url}</p>
                    
                    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                    
                    <p style="font-size: 12px; color: #999999;">This verification link will expire in {expires_minutes} minutes for security reasons.</p>
                    
                    <p style="font-size: 12px; color: #999999;">If you didn't create an account with us, please ignore this email.</p>
                    
                    <p style="font-size: 14px; color: #666666;">Best regards,<br>The Full Stack Template Team</p>
                </div>
            </body>
            </html>
            """

            await send_email_task.kiq(
                to_email=email,
                subject=email_subject,
                body=email_body
            )

            # Log success
            logger.info("Verification email scheduled for %s", email)

            # Step 5: Return true if email scheduled successfully
            return True

        except Exception:
            # Log unexpected errors
            logger.error("Error sending verification email:\n%s", traceback.format_exc())
            return False

    # ---------------------------- Create Verification Token ----------------------------
    @staticmethod
    async def create_verification_token(
        email: str,
        expires_minutes: int = settings.RESET_TOKEN_EXPIRE_MINUTES
    ) -> str:
        """
        Input:
            1. email (str): User email.
            2. expires_minutes (int): Expiration time in minutes.

        Process:
            1. Generate JWT token using JWTService with a fixed verification role.
            2. Return generated token.

        Output:
            1. str: Encoded JWT verification token.
        """
        # Step 1: Generate JWT token using JWTService with a fixed verification role
        # Role is hardcoded to "verify" — this token is only valid for email confirmation,
        # not for accessing any protected routes
        token = await jwt_service.create_access_token(email=email, role="verify")

        # Step 2: Return generated token
        return token

    # ---------------------------- Verify Token ----------------------------
    @staticmethod
    async def verify_token(token: str) -> dict | None:
        """
        Input:
            1. token (str): Verification token to validate.

        Process:
            1. Decode JWT token using JWTService.
            2. Check Redis for single-use enforcement.
            3. Delete token from Redis to prevent reuse.
            4. Return decoded payload.

        Output:
            1. dict | None: Decoded payload if valid, else None.
        """
        try:
            # Step 1: Decode JWT token using JWTService
            payload = await jwt_service.verify_token(token)
            if not payload:
                return None

            # Step 2: Check Redis for single-use enforcement
            exists = await redis_client.get(f"verify:{token}")
            if not exists:
                # Token not found or already used
                logger.warning("Verification token not found or already used")
                return None

            # Step 3: Delete token from Redis to prevent reuse
            await redis_client.delete(f"verify:{token}")

            # Step 4: Return decoded payload
            return payload

        except Exception:
            # Unexpected errors
            logger.error("Error verifying account verification token:\n%s", traceback.format_exc())
            return None


# ---------------------------- Service Instance ----------------------------
# Singleton instance for account verification operations
account_verification_service = AccountVerificationService()