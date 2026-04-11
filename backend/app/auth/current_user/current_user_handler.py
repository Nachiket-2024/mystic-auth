# ---------------------------- External Imports ----------------------------
# Module to capture full stack traces for debugging exceptions
import traceback

# SQLAlchemy exceptions for handling DB errors
from sqlalchemy.exc import SQLAlchemyError

# FastAPI HTTP exception for proper status codes
from fastapi import HTTPException, status

# ---------------------------- Internal Imports ----------------------------
# JWT service to decode and verify access tokens
from ..token_logic.jwt_service import jwt_service

# Single user CRUD instance for querying the unified users table
from ...user_crud.user_crud_collector import user_crud

# UserRole enum for role validation against known values
from ...user_table.user_model import UserRole

# Import centralized logger factory to create structured, module-specific loggers
from ...logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- Current User Handler Class ----------------------------
# Handles fetching the currently authenticated user
class CurrentUserHandler:
    """
    1. get_current_user - Fetch the currently authenticated user's basic information.
    """

    # ---------------------------- Get Current User ----------------------------
    async def get_current_user(self, access_token: str, db) -> dict:
        """
        Input:
            1. access_token (str): JWT token provided by the client.
            2. db: Database session for querying user records.

        Process:
            1. Check if access token is provided.
            2. Verify the access token using JWT service.
            3. Extract user email and role from token payload.
            4. Validate email and role against known UserRole values.
            5. Query the single users table by email.
            6. Return basic user information if found, else raise exception.

        Output:
            1. dict: Contains user info ('name', 'email', 'role') if successful.
        """
        try:
            # Step 1: Check if access token is provided
            if not access_token:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="No access token provided"
                )

            # Step 2: Verify the access token using JWT service
            payload = await jwt_service.verify_token(access_token)

            # Raise error if token is invalid or expired
            if not payload:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token"
                )

            # Step 3: Extract user email and role from token payload
            email = payload.get("email")
            role = payload.get("role")

            # Step 4: Validate email and role against known UserRole values
            if not email or not role:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token payload"
                )

            # Step 4 (continued): Reject tokens carrying an unrecognised role
            if role not in UserRole._value2member_map_:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User role not recognized"
                )

            # Step 5: Query the single users table by email
            user = await user_crud.get_by_email(email, db)

            # Step 5 (continued): Raise error if user not found
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found"
                )

            # Step 5 (continued): Raise error if account is inactive
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is deactivated"
                )

            # Step 6: Return basic user information
            return {
                "name": user.name,
                "email": user.email,
                "role": user.role.value
            }

        # Handle database errors
        except SQLAlchemyError:
            logger.error("Database error fetching current user:\n%s", traceback.format_exc())
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error"
            )

        # Re-raise known HTTPExceptions
        except HTTPException:
            raise

        # Handle unexpected errors
        except Exception:
            logger.error("Error fetching current user:\n%s", traceback.format_exc())
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Internal server error"
            )


# ---------------------------- Service Instance ----------------------------
# Singleton instance of CurrentUserHandler
current_user_handler = CurrentUserHandler()