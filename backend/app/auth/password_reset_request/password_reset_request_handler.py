# ---------------------------- External Imports ----------------------------
# Module to capture detailed exception stack traces
import traceback

# FastAPI class for sending JSON responses to clients
from fastapi.responses import JSONResponse

# ---------------------------- Internal Imports ----------------------------
# Core password reset service for sending reset tokens via email
from ..password_logic.password_reset_service import password_reset_service

# Import centralized logger factory to create structured, module-specific loggers
from ...logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- Password Reset Request Handler Class ----------------------------
# Class responsible for handling password reset request flow
class PasswordResetRequestHandler:
    """
    1. handle_password_reset_request - Process password reset requests and send reset token if user exists.
    """

    # ---------------------------- Constructor ----------------------------
    # Initialize handler with required service dependencies
    def __init__(self):
        # Assign password reset service to instance
        self.password_reset_service = password_reset_service

    # ---------------------------- Handle Password Reset Request ----------------------------
    # Async method to process password reset request and send token if user exists
    async def handle_password_reset_request(self, email: str, db):
        """
        Input:
            1. email (str): Email address of the user requesting password reset.
            2. db (AsyncSession): Database session for verifying user existence.

        Process:
            1. Attempt to send password reset email via password_reset_service.
            2. Log requests for non-existing emails without revealing sensitive info.
            3. Return generic response to prevent email enumeration.

        Output:
            1. JSONResponse: Generic message indicating reset link sent or internal server error on failure.
        """
        try:
            # Step 1: Attempt to send password reset email via password_reset_service
            # Service internally checks if user exists — returns False if not found
            email_sent = await self.password_reset_service.send_reset_email(email, db)

            # Step 2: Log requests for non-existing emails without revealing sensitive info
            if not email_sent:
                logger.info("Password reset requested for non-existing email: %s", email)

            # Step 3: Return a generic success response to prevent email enumeration
            # Always return 200 regardless of whether user exists — prevents email enumeration
            return JSONResponse(
                content={"message": "If the email exists, a reset link has been sent."},
                status_code=200
            )

        except Exception:
            # Log any exceptions with full stack trace
            logger.error("Error during password reset request logic:\n%s", traceback.format_exc())

            # Return generic internal server error response
            return JSONResponse(content={"error": "Internal Server Error"}, status_code=500)


# ---------------------------- Singleton Instance ----------------------------
# Singleton instance of the handler for route usage
password_reset_request_handler = PasswordResetRequestHandler()