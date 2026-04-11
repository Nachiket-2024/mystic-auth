# ---------------------------- External Imports ----------------------------
# Capture full stack traces for detailed exception debugging
import traceback

# Async SQLAlchemy session for database operations
from sqlalchemy.ext.asyncio import AsyncSession

# FastAPI response class for sending JSON responses
from fastapi.responses import JSONResponse

# ---------------------------- Internal Imports ----------------------------
# Signup service that handles user creation and password hashing
from .signup_service import signup_service

# Account verification service that handles email verification & Redis token management
from ..verify_account.account_verification_service import account_verification_service

# Import centralized logger factory to create structured, module-specific loggers
from ...logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- Signup Handler Class ----------------------------
# Class encapsulating user signup logic
class SignupHandler:
    """
    1. handle_signup - Handle user signup, create account, and send verification email.
    """

    # ---------------------------- Static Async Signup Method ----------------------------
    @staticmethod
    async def handle_signup(name: str, email: str, password: str, db: AsyncSession = None):
        """
        Input:
            1. name (str): Full name of the user.
            2. email (str): Email address of the user.
            3. password (str): Plaintext password.
            4. db (AsyncSession): Database session for creating user.

        Process:
            1. Validate required input fields (name, email, password).
            2. Call signup service to create the user with default role.
            3. Check if user creation was successful; return error if not.
            4. Send verification email using account verification service.
            5. Return success JSONResponse if all steps succeed.

        Output:
            1. JSONResponse: Success or error message with appropriate HTTP status code.
        """
        try:
            # Step 1: Validate required input fields (name, email, password)
            if not name or not email or not password:
                return JSONResponse(
                    content={"error": "Name, email, and password are required"},
                    status_code=400
                )

            # Step 2: Call signup service to create the user with default role
            # Role is hardcoded to UserRole.user inside signup_service — not passed here
            user_created = await signup_service.signup(
                name=name,
                email=email,
                password=password,
                db=db
            )

            # Step 3: Check if user creation was successful; return error if not
            if not user_created:
                return JSONResponse(
                    content={"error": "Signup failed (invalid data or email already registered)"},
                    status_code=400
                )

            # Step 4: Send verification email using account verification service
            await account_verification_service.send_verification_email(email)

            # Step 5: Return success JSONResponse if all steps succeed
            return JSONResponse(
                content={"message": "Signup successful. Please verify your email to activate your account."},
                status_code=200
            )

        except Exception:
            # Log full exception stack trace
            logger.error("Error during signup logic:\n%s", traceback.format_exc())

            # Return generic internal server error
            return JSONResponse(
                content={"error": "Internal Server Error"},
                status_code=500
            )


# ---------------------------- Singleton Instance ----------------------------
# Singleton instance to handle signup requests
signup_handler = SignupHandler()