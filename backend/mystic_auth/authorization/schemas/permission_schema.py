from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..conditions.condition_validator import sanitize_conditions_for_read


class PermissionAssignmentRequest(BaseModel):
    """Request body for granting a direct permission to a user."""

    action: str = Field(..., min_length=1, max_length=200)
    resource_type: str = Field(..., min_length=1, max_length=100)
    conditions: dict | None = None


class UserPermissionRead(BaseModel):
    """Schema returned by the direct-permission-grant management API."""

    id: int
    action: str
    resource_type: str
    conditions: dict | None = None
    is_active: bool
    assigned_by: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("conditions", mode="before")
    @classmethod
    def _sanitize_conditions(cls, value: dict | None) -> dict | None:
        return sanitize_conditions_for_read(value)


class UserPermissionsRead(BaseModel):
    """Response shape for 'list direct permission grants held by a user'."""

    user_email: str
    permissions: list[UserPermissionRead]


class PermissionCatalogEntryRead(BaseModel):
    """One entry of the read-only, code-defined permission catalog (see
    authorization/permissions_catalog.py) - the fixed action vocabulary an
    admin can assign, either directly or bundled into a Policy."""

    action: str
    resource_type: str
    description: str
