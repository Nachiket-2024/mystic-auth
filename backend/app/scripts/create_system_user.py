# ---------------------------- External Imports ----------------------------
# Asyncio for running async functions from CLI entry point
import asyncio

# Getpass for securely collecting password input without echo
import getpass

# ---------------------------- Internal Imports ----------------------------
# Database connection for obtaining async sessions
from ..database.connection import database

# Single user CRUD instance for querying the unified users table
from ..user_crud.user_crud_collector import user_crud

# UserRole enum for assigning system role
from ..user_table.user_model import UserRole

# Password service for hashing the system user's password
from ..auth.password_logic.password_service import password_service

# Centralized logger factory for structured logging
from ..logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- System User Constants ----------------------------
# Role assigned to the system superuser
SYSTEM_ROLE = UserRole.system

# ---------------------------- Create System User Function ----------------------------
async def create_system_user():
    """
    Interactive CLI script to create the one-time system superuser.

    Process:
        1. Collect name, email, and password interactively from terminal.
        2. Check if a user with that email already exists.
        3. Hash the password securely.
        4. Create the system user row in the unified users table.

    Usage:
        Run once manually before first launch:
        python -m app.scripts.create_system_user
    """
    print("\n--- System Superuser Creation ---")

    # Step 1: Collect details interactively from terminal
    name     = input("Enter system user name: ").strip()
    email    = input("Enter system user email: ").strip()
    password = getpass.getpass("Enter system user password: ")

    # Open a database session
    async for db in database.get_session():

        # Step 2: Check if a user with that email already exists
        existing = await user_crud.get_by_email(email, db)
        if existing:
            print(f"\n A user with email '{email}' already exists.")
            logger.warning("System user creation failed — email already exists: %s", email)
            return

        # Step 3: Hash the password securely before storage
        hashed_password = await password_service.hash_password(password)

        # Step 4: Create system user row in the unified users table
        await user_crud.create({
            "name":            name,
            "email":           email,
            "hashed_password": hashed_password,
            "role":            SYSTEM_ROLE,   # Highest privilege role
            "is_verified":     True,          # No email verification needed for system user
            "is_active":       True,          # Fully active from the moment of creation
        }, db)

        print(f"\n System user '{email}' created successfully.")
        logger.info("System user created successfully: %s", email)


# ---------------------------- Entry Point ----------------------------
# Allow running directly as a script via python -m app.scripts.create_system_user
if __name__ == "__main__":
    asyncio.run(create_system_user())