from datetime import UTC, datetime
from unittest.mock import AsyncMock

from backend.mystic_auth.user.user_model import UserRole

MODULE = "backend.mystic_auth.auth.current_user.current_user_handler"


class _FakeUser:
    def __init__(
        self,
        name="Test User",
        email="user@example.com",
        role="user",
        is_active=True,
        hashed_password="hash",
        created_at=None,
        brand_color=None,
    ):
        self.name = name
        self.email = email
        self.role = UserRole(role) if role is not None else None
        self.is_active = is_active
        self.hashed_password = hashed_password
        self.created_at = created_at or datetime(2026, 1, 1, tzinfo=UTC)
        self.brand_color = brand_color


class _FakePolicy:
    def __init__(self, actions, resource_type="users"):
        self.actions = actions
        # Every action below is "users:...", so "users" is a correct
        # default here; a test that wants cross-resource-type filtering
        # passes resource_type explicitly.
        self.resource_type = resource_type


class _FakeGrant:
    """Stands in for a UserPermission row: a direct (bypasses-Policy) grant
    of exactly one action. Same resource_type default/override convention
    as _FakePolicy above."""

    def __init__(self, action, resource_type="users"):
        self.action = action
        self.resource_type = resource_type


def _mock_no_direct_grants(mocker):
    """Most tests here aren't exercising direct grants; this keeps them
    from needing to know that call exists."""
    mocker.patch(
        f"{MODULE}.user_permission_repository.get_active_permissions_for_user",
        new_callable=AsyncMock,
        return_value=[],
    )


def _patch_identity(
    mocker, *, payload=None, user=None, token_error=None, lookup_error=None
):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        side_effect=token_error,
        return_value=payload,
    )
    mocker.patch(
        f"{MODULE}.user_crud.get_by_email",
        new_callable=AsyncMock,
        side_effect=lookup_error,
        return_value=user,
    )
