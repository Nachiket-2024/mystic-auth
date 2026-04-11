# ---------------------------- External Imports ----------------------------
# Module to capture and print detailed exception traces
import traceback

# FastAPI class for sending JSON responses to clients
from fastapi.responses import JSONResponse

# ---------------------------- Internal Imports ----------------------------
# Service for JWT operations like token verification and decoding
from ..token_logic.jwt_service import jwt_service

# Service to handle password reset operations
from ..password_logic.password_reset_service import password_reset_service

# Service for login protection such as rate limiting and account lockouts
from ..security.login_protection_service import login_protection_service

# Import centralized logger factory to create structured, module-specific loggers
from ...logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- Password Reset Confirm Handler Class ----------------------------
# Class responsible for handling password reset confirmation logic
class PasswordResetConfirmHandler:
    """
    1. handle_password_reset_confirm - Verify token, reset password, and enforce login protection.
    """

    # ---------------------------- Constructor ----------------------------
    # Initialize handler with required service dependencies
    def __init__(self):
        # Assign JWT service to instance
        self.jwt_service = jwt_service

        # Assign password reset service to instance
        self.password_reset_service = password_reset_service

        # Assign login protection service to instance
        self.login_protection_service = login_protection_service

    # ---------------------------- Handle Password Reset Confirmation ----------------------------
    # Async method to confirm password reset and perform validation, logging, and brute-force checks
    async def handle_password_reset_confirm(self, token: str, new_password: str, db):
        """
        Input:
            1. token (str): JWT token for password reset verification.
            2. new_password (str): New password to set for the user.
            3. db (AsyncSession): Database session for updating user record.

        Process:
            1. Decode the JWT token using the JWT service.
            2. Validate that the token payload is not None.
            3. Validate that the token contains the 'email' field.
            4. Extract the email from the token payload.
            5. Generate a key for tracking login attempts using the email.
            6. Attempt to reset the user's password using the password reset service.
            7. Determine HTTP status code based on success of password reset.
            8. Prepare response content based on password reset outcome.
            9. Record the action in login protection service.
            10. Enforce lockout if too many failed attempts occurred.
            11. Return the final JSON response to the client.

        Output:
            1. JSONResponse: Success or error message with appropriate HTTP status code.
        """
        try:
            # Step 1: Decode the JWT token using the JWT service
            payload = await self.jwt_service.verify_token(token)

            # Step 2: Validate that the token payload is not None
            # Step 3: Validate that the token contains the 'email' field
            if not payload or "email" not in payload:
                return JSONResponse({"error": "Invalid or expired token"}, status_code=400)

            # Step 4: Extract the email from the token payload
            email = payload["email"]

            # Step 5: Generate a key for tracking login attempts using the email
            email_lock_key = f"login_lock:email:{email}"

            # Step 6: Attempt to reset the user's password using the password reset service
            success = await self.password_reset_service.reset_password(token, new_password, db)

            # Step 7: Determine HTTP status code based on success of password reset
            status = 200 if success else 400

            # Step 8: Prepare response content based on password reset outcome
            content = {"message": "Password has been reset successfully"} if success else {"error": "Invalid token or password"}

            # Step 9: Record the action in login protection service
            allowed = await self.login_protection_service.check_and_record_action(
                email_lock_key, success=(status == 200)
            )

            # Step 10: Enforce lockout if too many failed attempts occurred
            if not allowed:
                return JSONResponse({"error": "Too many failed attempts, temporarily locked"}, status_code=429)

            # Step 11: Return the final JSON response to the client
            return JSONResponse(content, status_code=status)

        except Exception:
            # Log any exceptions with full stack trace
            logger.error("Error during password reset confirm logic:\n%s", traceback.format_exc())

            # Return generic internal server error response
            return JSONResponse({"error": "Internal Server Error"}, status_code=500)


# ---------------------------- Instantiate Handler ----------------------------
# Create a single global instance of the handler for route usage
password_reset_confirm_handler = PasswordResetConfirmHandler()