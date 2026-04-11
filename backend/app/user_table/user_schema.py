# ---------------------------- External Imports ----------------------------
# Core Pydantic validation and serialization utilities
from pydantic import BaseModel, ConfigDict, EmailStr

# Date/time support for response schemas
from datetime import datetime

# ---------------------------- Internal Imports ----------------------------
# Role enum shared between model and schema
from .user_model import UserRole

# ---------------------------- Base User Schema ----------------------------
class UserBase(BaseModel):
    """
    Shared base schema for User data used across create/read schemas.
    """

    # Full name of the user
    name: str

    # Email used for authentication
    email: EmailStr


# ---------------------------- User Create Schema ----------------------------
class UserCreate(UserBase):
    """
    Schema used when registering a new user account.
    Role defaults to 'user' — admin accounts are assigned separately.
    """

    # Plain password provided during signup (hashed before storage)
    password: str


# ---------------------------- User Update Schema ----------------------------
class UserUpdate(BaseModel):
    """
    Schema for user-controlled profile updates only.
    Role changes are intentionally excluded — use admin endpoints for that.
    """

    # Optional name update
    name: str | None = None

    # Optional password update (plain — will be hashed before storage)
    password: str | None = None


# ---------------------------- Admin Role Update Schema ----------------------------
class UserRoleUpdate(BaseModel):
    """
    Schema used exclusively by admin endpoints to change a user's role.
    Kept separate from UserUpdate to make privilege escalation explicit.
    """

    # New role to assign to the user
    role: UserRole


# ---------------------------- User Read Schema ----------------------------
class UserRead(UserBase):
    """
    Schema returned in API responses.
    Exposes role as a plain string for clean serialization.
    """

    # Unique user identifier
    id: int

    # Role assigned to this user
    role: UserRole

    # Account verification status
    is_verified: bool

    # Account active status
    is_active: bool

    # Timestamp when user was created
    created_at: datetime

    # Timestamp when user was last updated
    updated_at: datetime

    # ---------------------------- ORM Configuration ----------------------------
    model_config = ConfigDict(from_attributes=True)