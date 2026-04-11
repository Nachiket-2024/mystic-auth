# ---------------------------- External Imports ----------------------------
# SQLAlchemy column types for defining database schema
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Enum

# Server-side timestamp utilities
from sqlalchemy.sql import func

# Python enum for role definition
import enum

# ---------------------------- Internal Imports ----------------------------
# Declarative base for all ORM models
from ..database.base import Base

# ---------------------------- Role Enum ----------------------------
class UserRole(str, enum.Enum):
    """
    Enumeration of all valid user roles in the system.
    Roles are mutually exclusive — a user holds exactly one at a time.

    Extend this enum to add new roles (e.g. moderator, staff).
    """

    # Standard user with basic access
    user = "user"

    # Administrator with elevated privileges
    admin = "admin"

    # System with the highest privileges
    system = "system"


# ---------------------------- User Model ----------------------------
class User(Base):
    """
    Central user authentication model supporting:
    - Email/password authentication
    - OAuth2 authentication (Google, etc.)
    - Role-based access control (RBAC) via a single role column
    """

    __tablename__ = "users"

    # ---------------------------- Primary Key ----------------------------
    # Unique identifier for each user in the system
    id = Column(Integer, primary_key=True, index=True)

    # ---------------------------- Identity Fields ----------------------------
    # Full name of the user
    name = Column(String, nullable=False)

    # Email address used for authentication (must be unique)
    email = Column(String, unique=True, index=True, nullable=False)

    # ---------------------------- Authentication Fields ----------------------------
    # Hashed password for email/password login (nullable for OAuth-only users)
    hashed_password = Column(String, nullable=True)

    # ---------------------------- Role ----------------------------
    # Single role assigned to the user — mutually exclusive
    # Stored as a native DB enum for data integrity
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)

    # ---------------------------- Account Status ----------------------------
    # Indicates whether the user has verified their email
    is_verified = Column(Boolean, default=False, nullable=False)

    # Soft-disable flag for deactivating accounts without deletion
    is_active = Column(Boolean, default=True, nullable=False)

    # ---------------------------- Timestamps ----------------------------
    # Record creation timestamp (set once by the DB on insert)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Record update timestamp (automatically updated by the DB on every change)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )