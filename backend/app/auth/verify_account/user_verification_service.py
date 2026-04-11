# ---------------------------- External Imports ----------------------------
# Capture full exception stack traces for debugging
import traceback

# ---------------------------- Internal Imports ----------------------------
# Single user CRUD instance for querying the unified users table
from ...user_crud.user_crud_collector import user_crud

# Import centralized logger factory to create structured, module-specific loggers
from ...logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- User Verification Service Class ----------------------------
# Service to handle marking users as verified
class UserVerificationService:
    """
    1. mark_user_verified - Mark a user as verified in the users table.
    """

    # ---------------------------- Mark User Verified ----------------------------
    @staticmethod
    async def mark_user_verified(email: str, db) -> bool:
        """
        Input:
            1. email (str): Email of the user to verify.
            2. db (AsyncSession): Database session for operations.

        Process:
            1. Fetch user from the unified users table by email.
            2. Return False if user not found or already verified.
            3. Update is_verified field to True in the database.
            4. Return True indicating successful verification.

        Output:
            1. bool: True if verification succeeded, False otherwise.
        """
        try:
            # Step 1: Fetch user from the unified users table by email
            user = await user_crud.get_by_email(email, db)

            # Step 2: Return False if user not found or already verified
            if not user:
                logger.warning("Verification attempted for non-existent user: %s", email)
                return False

            if user.is_verified:
                logger.info("User %s is already verified", email)
                return False

            # Step 3: Update is_verified field to True in the database
            await user_crud.update_by_email(email, {"is_verified": True}, db)

            # Log the verification action for auditing
            logger.info("User %s successfully marked as verified", email)

            # Step 4: Return True indicating successful verification
            return True

        # Catch all unexpected exceptions during verification
        except Exception:
            # Log the full traceback for debugging purposes
            logger.error("Error marking user verified:\n%s", traceback.format_exc())
            return False


# ---------------------------- Service Instance ----------------------------
# Singleton instance to handle user verification operations
user_verification_service = UserVerificationService()