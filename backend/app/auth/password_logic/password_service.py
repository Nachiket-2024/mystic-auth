# ---------------------------- External Imports ----------------------------
# Password hashing library with Argon2 support for secure password storage
from passlib.context import CryptContext

# Modules for handling date and time calculations
from datetime import datetime, timedelta, timezone

# JWT library for encoding and decoding JSON Web Tokens
import jwt

# ---------------------------- Internal Imports ----------------------------
# Application settings including SECRET_KEY and JWT configurations
from ...core.settings import settings

# ---------------------------- Password Context ----------------------------
# Configure password hashing using Argon2id algorithm
pwd_context = CryptContext(
    schemes=["argon2"],  # Use Argon2 hashing scheme
    deprecated="auto"    # Automatically handle deprecated hashes
)

# ---------------------------- Password Service ----------------------------
# Service class handling password hashing, verification, and reset tokens
class PasswordService:
    """
    1. hash_password - Hash a plain password.
    2. verify_password - Compare plain and hashed passwords.
    3. validate_password_strength - Check password meets minimum requirements.
    4. create_reset_token - Generate JWT for password reset.
    5. verify_reset_token - Decode and validate reset JWT.
    """

    # ---------------------------- Hash Password ----------------------------
    @staticmethod
    async def hash_password(password: str) -> str:
        """
        Input:
            1. password (str): Plain password string to be hashed.

        Process:
            1. Hash the password using pwd_context with Argon2.

        Output:
            1. str: Hashed password string.
        """
        # Step 1: Hash the password using pwd_context with Argon2
        return pwd_context.hash(password)

    # ---------------------------- Verify Password ----------------------------
    @staticmethod
    async def verify_password(plain_password: str, hashed_password: str) -> bool:
        """
        Input:
            1. plain_password (str): Plain password to verify.
            2. hashed_password (str): Hashed password to compare against.

        Process:
            1. Verify the plain password against the hashed password using pwd_context.

        Output:
            1. bool: True if passwords match, False otherwise.
        """
        # Step 1: Verify the plain password against the hashed password using pwd_context
        return pwd_context.verify(plain_password, hashed_password)

    # ---------------------------- Validate Password Strength ----------------------------
    @staticmethod
    async def validate_password_strength(password: str) -> bool:
        """
        Input:
            1. password (str): Plain password to validate.

        Process:
            1. Check password meets minimum length requirement.

        Output:
            1. bool: True if password is strong enough, False otherwise.
        """
        # Step 1: Check password meets minimum length requirement
        return len(password) >= 8

    # ---------------------------- Create Reset Token ----------------------------
    @staticmethod
    async def create_reset_token(
        email: str,
        expires_minutes: int = settings.RESET_TOKEN_EXPIRE_MINUTES
    ) -> str:
        """
        Input:
            1. email (str): Email of the user requesting reset.
            2. expires_minutes (int): Expiration time in minutes for token.

        Process:
            1. Calculate expiration timestamp in UTC.
            2. Create payload with email and expiration.
            3. Encode JWT using SECRET_KEY and JWT_ALGORITHM.

        Output:
            1. str: Encoded JWT token string.
        """
        # Step 1: Calculate expiration timestamp in UTC
        expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)

        # Step 2: Create payload with email and expiration
        # Role is intentionally excluded — single users table makes it unnecessary
        payload: dict[str, str | float] = {
            "email": email,
            "exp": expire.timestamp()
        }

        # Step 3: Encode JWT using SECRET_KEY and JWT_ALGORITHM
        return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    # ---------------------------- Verify Reset Token ----------------------------
    @staticmethod
    async def verify_reset_token(token: str) -> dict | None:
        """
        Input:
            1. token (str): JWT token string to verify.

        Process:
            1. Decode JWT using SECRET_KEY and JWT_ALGORITHM.
            2. Validate email is present in payload.
            3. Return payload if valid.

        Output:
            1. dict | None: Payload dict if valid, None if invalid or expired.
        """
        try:
            # Step 1: Decode JWT using SECRET_KEY and JWT_ALGORITHM
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM]
            )

            # Step 2: Validate email is present in payload
            if not payload.get("email"):
                return None

            # Step 3: Return payload if valid
            return payload

        except jwt.ExpiredSignatureError:
            # Token expired
            return None

        except jwt.InvalidTokenError:
            # Token invalid
            return None


# ---------------------------- Service Instance ----------------------------
# Single global instance of PasswordService
password_service = PasswordService()