from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field
from datetime import datetime

from .user_model import UserRole


class UserBase(BaseModel):
    """Shared base schema for User data used across create/read schemas."""

    name: str
    email: EmailStr


class UserCreate(UserBase):
    """Schema used when registering a new user account. Role defaults to
    'user' — admin accounts are assigned separately."""

    password: str


class UserUpdate(BaseModel):
    """Schema for user-controlled profile updates only. Role changes are
    intentionally excluded — use admin endpoints for that."""

    name: str | None = None
    password: str | None = None


class UserRoleUpdate(BaseModel):
    """Schema used exclusively by admin endpoints to change a user's role.
    Kept separate from UserUpdate to make privilege escalation explicit."""

    role: UserRole


class UserRead(UserBase):
    """Schema returned in API responses. Exposes role as a plain string for
    clean serialization."""

    id: int

    # Display/grouping metadata only; None for an account with no role at all
    # (see user_model.py's Role note).
    role: UserRole | None

    is_verified: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # When this account was soft-deleted, if ever — None means never deleted
    # (or fully restored via reactivation, which clears it).
    deleted_at: datetime | None = None

    # Pulled in from the ORM object (from_attributes) purely to derive
    # has_password below; excluded from the response so the hash itself is
    # never serialized.
    hashed_password: str | None = Field(default=None, exclude=True)

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def has_password(self) -> bool:
        """Whether this account currently has a usable password credential
        (False for an OAuth-only account — see user_model.py's
        hashed_password column and oauth2_service.py's login_or_create_user,
        which is the only thing that ever clears it back to None)."""
        return self.hashed_password is not None
