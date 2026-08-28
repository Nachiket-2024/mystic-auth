import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database.base import Base


class UserRole(str, enum.Enum):
    """
    Enumeration of all valid user roles in the system.
    Roles are mutually exclusive : a user holds exactly one at a time.

    Extend this enum to add new roles (e.g. moderator, staff).
    """

    user = "user"
    admin = "admin"
    system = "system"


class User(Base):
    """
    Central user authentication model supporting:
    - Email/password authentication
    - OAuth2 authentication (Google, etc.)
    - A single `role` column kept as display/grouping metadata only : see
      `role` below and `authorization/` for the actual PBAC decision-maker,
      which never reads this column
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    name: Mapped[str]
    email: Mapped[str] = mapped_column(unique=True, index=True)

    # Nullable for OAuth-only users.
    hashed_password: Mapped[str | None]

    # Nullable: role is display/grouping metadata only, never read by the
    # actual PBAC decision-maker, so a roleless account is authorized purely
    # through assigned policies. No Python-side `default=`: SQLAlchemy would
    # treat an explicit role=None the same as omitted and apply the column
    # default anyway, making a roleless account impossible to persist.
    role: Mapped[UserRole | None] = mapped_column(Enum(UserRole))

    # Per-user re-skin of the app's brand accent/logo/favicon (#rrggbb).
    # NULL means "use the app default" (app/theme.ts's brand scale), never a
    # stored literal default : see AppearanceCard.tsx/applyAppearanceOverride.ts
    # on the frontend for how this is generated into a full color scale.
    brand_color: Mapped[str | None] = mapped_column(String(7))

    is_verified: Mapped[bool] = mapped_column(default=False)

    # Soft-disable flag for deactivating accounts without deletion. Every
    # auth check point already gates on this, so soft-deleting an account
    # reuses it rather than adding a second, parallel "is deleted" check.
    is_active: Mapped[bool] = mapped_column(default=True)

    # Soft-delete marker: set when an account is deleted via the default
    # (reversible) flow. NULL means never deleted, distinct from
    # is_active=False alone so an operator can tell "deactivated" apart
    # from "deleted." See docs/mystic_auth/security/decisions.md.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
