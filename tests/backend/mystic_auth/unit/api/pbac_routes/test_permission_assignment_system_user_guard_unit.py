# grant_permission_to_user and revoke_permission_from_user
# (permission_assignment_routes.py) treat a UserRole.system target like any
# other account. Direct grants only ever add access (no deny), so they cannot
# weaken the system user's baseline policies, which are protected on the
# policy routes instead. The caller's escalation guard still applies.
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.mystic_auth.api.pbac_routes.permissions.permission_assignment_routes import (
    grant_permission_to_user,
    revoke_permission_from_user,
)
from backend.mystic_auth.authorization.schemas.permission_schema import (
    PermissionAssignmentRequest,
)
from backend.mystic_auth.user.user_model import UserRole

SERVICE_MODULE = "backend.mystic_auth.authorization.services.authorization_service"
ROUTES_MODULE = "backend.mystic_auth.api.pbac_routes.permissions.permission_assignment_routes"

CALLER = {"email": "caller@example.com", "name": "Caller"}


def _make_system_user(email="system@example.com"):
    user = MagicMock()
    user.id = 99
    user.email = email
    user.role = UserRole.system
    return user


def _patch_common(mocker, system_user):
    mocker.patch(f"{ROUTES_MODULE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=system_user)
    mocker.patch(f"{ROUTES_MODULE}.log_security_event", new_callable=AsyncMock)
    mocker.patch(f"{ROUTES_MODULE}.publish_permissions_changed", new_callable=AsyncMock)
    mocker.patch(f"{ROUTES_MODULE}.build_authorization_context", return_value={})
    return mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.assert_authorized_to_grant", new_callable=AsyncMock)


@pytest.mark.asyncio
async def test_grant_permission_to_system_user_is_allowed_and_escalation_checked(mocker):
    system_user = _make_system_user()
    guard_mock = _patch_common(mocker, system_user)
    assign_mock = mocker.patch(
        f"{ROUTES_MODULE}.user_permission_repository.assign_permission_to_user", new_callable=AsyncMock
    )

    result = await grant_permission_to_user(
        system_user.email,
        PermissionAssignmentRequest(action="users:read_own", resource_type="users"),
        request=MagicMock(), current_user=CALLER, db="fake-db",
    )

    assert "users:read_own" in result["detail"]
    guard_mock.assert_awaited_once()
    assign_mock.assert_awaited_once()
    assert assign_mock.await_args.kwargs["user_id"] == system_user.id


@pytest.mark.asyncio
async def test_grant_permission_to_system_user_still_refused_when_caller_lacks_the_action(mocker):
    system_user = _make_system_user()
    guard_mock = _patch_common(mocker, system_user)
    guard_mock.side_effect = HTTPException(status_code=403, detail="cannot grant")
    assign_mock = mocker.patch(
        f"{ROUTES_MODULE}.user_permission_repository.assign_permission_to_user", new_callable=AsyncMock
    )

    with pytest.raises(HTTPException):
        await grant_permission_to_user(
            system_user.email,
            PermissionAssignmentRequest(action="users:read_own", resource_type="users"),
            request=MagicMock(), current_user=CALLER, db="fake-db",
        )

    assign_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_revoke_permission_from_system_user_is_allowed(mocker):
    system_user = _make_system_user()
    guard_mock = _patch_common(mocker, system_user)
    remove_mock = mocker.patch(
        f"{ROUTES_MODULE}.user_permission_repository.remove_permission_from_user",
        new_callable=AsyncMock, return_value=True,
    )

    result = await revoke_permission_from_user(
        system_user.email, "users:read_own", "users",
        request=MagicMock(), current_user=CALLER, db="fake-db",
    )

    assert "users:read_own" in result["detail"]
    guard_mock.assert_awaited_once()
    remove_mock.assert_awaited_once()
