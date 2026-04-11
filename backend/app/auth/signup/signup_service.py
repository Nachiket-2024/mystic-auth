# ---------------------------- External Imports ----------------------------
# Capture full exception stack traces for debugging
import traceback

# Async SQLAlchemy session for database operations
from sqlalchemy.ext.asyncio import AsyncSession

# ---------------------------- Internal Imports ----------------------------
# Single user CRUD instance for querying the unified users table
from ...user_crud.user_crud_collector import user_crud

# Default role assigned to all new users on signup
from ...user_table.user_model import UserRole

# Password service for hashing passwords
from ..password_logic.password_service import password_service

# Import centralized logger factory to create structured, module-specific loggers
from ...logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- Signup Service Class ----------------------------
# Service class to handle user signup logic
class SignupService:
    """
    1. signup - Hash password, check duplicates, and create user with default role.
    """

    # ---------------------------- Static Async Signup Method ----------------------------
    @staticmethod
    async def signup(name: str, email: str, password: str, db: AsyncSession) -> bool:
        """
        Input:
            1. name (str): Full name of the new user.
            2. email (str): Email address of the new user.
            3. password (str): Plaintext password.
            4. db (AsyncSession): Async database session for DB operations.

        Process:
            1. Check if user with same email already exists in users table.
            2. Hash the password securely.
            3. Prepare user data dictionary with default role.
            4. Insert new user into the users table.
            5. Return True if user created successfully.

        Output:
            1. bool: True if user created successfully, False otherwise.
        """
        try:
            # Step 1: Check if user with same email already exists in users table
            existing_user = await user_crud.get_by_email(email, db)
            if existing_user:
                logger.info("Signup attempt with existing email: %s", email)
                return False

            # Step 2: Hash the password securely
            hashed_password = await password_service.hash_password(password)

            # Step 3: Prepare user data dictionary with default role
            user_data = {
                "name": name,                           # User's full name
                "email": email,                         # User's email
                "hashed_password": hashed_password,     # Secure hashed password
                "role": UserRole.user,                  # Default role for all new signups
                "is_verified": False,                   # New users start as unverified
                "is_active": True                       # Account active by default
            }

            # Step 4: Insert new user into the users table
            await user_crud.create(user_data, db)

            # Step 5: Return True if user created successfully
            return True

        except Exception:
            # Log full exception stack trace
            logger.error("Error during signup:\n%s", traceback.format_exc())
            return False


# ---------------------------- Singleton Instance ----------------------------
# Singleton instance to handle signup operations
signup_service = SignupService()