# PBAC tests for the permissions returned by GET /auth/me.
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.current_user.current_user_handler import (
    current_user_handler,
)

from .current_user_test_support import (
    MODULE,
    _FakeGrant,
    _FakePolicy,
    _FakeUser,
)


@pytest.mark.asyncio
async def test_a_direct_grant_with_no_assigned_policies_at_all_still_appears(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "creator@example.com", "role": "user"},
    )
    mocker.patch(
        f"{MODULE}.user_crud.get_by_email",
        return_value=_FakeUser(email="creator@example.com"),
    )
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[],
    )
    mocker.patch(
        f"{MODULE}.user_permission_repository.get_active_permissions_for_user",
        new_callable=AsyncMock,
        return_value=[_FakeGrant("policies:create", resource_type="policies")],
    )

    result = await current_user_handler.get_current_user("some-token", db=None)

    assert result["permissions"] == ["policies:create"]


@pytest.mark.asyncio
async def test_direct_grants_and_policy_derived_actions_are_unioned(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "user"},
    )
    mocker.patch(f"{MODULE}.user_crud.get_by_email", return_value=_FakeUser())
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[_FakePolicy(["users:read_own", "users:update_own"])],
    )
    mocker.patch(
        f"{MODULE}.user_permission_repository.get_active_permissions_for_user",
        new_callable=AsyncMock,
        return_value=[_FakeGrant("policies:create", resource_type="policies")],
    )

    result = await current_user_handler.get_current_user("some-token", db=None)

    assert result["permissions"] == [
        "policies:create",
        "users:read_own",
        "users:update_own",
    ]


@pytest.mark.asyncio
async def test_a_direct_grant_already_covered_by_a_policy_is_not_duplicated(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "user"},
    )
    mocker.patch(f"{MODULE}.user_crud.get_by_email", return_value=_FakeUser())
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[_FakePolicy(["users:read_own"])],
    )
    mocker.patch(
        f"{MODULE}.user_permission_repository.get_active_permissions_for_user",
        new_callable=AsyncMock,
        return_value=[_FakeGrant("users:read_own")],
    )

    result = await current_user_handler.get_current_user("some-token", db=None)

    assert result["permissions"] == ["users:read_own"]


@pytest.mark.asyncio
async def test_a_direct_grant_scoped_to_the_wrong_resource_type_is_excluded(mocker):
    # Same reasoning as the identical filter on policy actions above: a
    # UserPermission's resource_type is independently editable from its
    # action, so a mis-scoped grant must not light up UI the backend
    # would 403 on for real.
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "user"},
    )
    mocker.patch(f"{MODULE}.user_crud.get_by_email", return_value=_FakeUser())
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[],
    )
    mocker.patch(
        f"{MODULE}.user_permission_repository.get_active_permissions_for_user",
        new_callable=AsyncMock,
        return_value=[_FakeGrant("policies:read", resource_type="users")],
    )

    result = await current_user_handler.get_current_user("some-token", db=None)

    assert result["permissions"] == []


@pytest.mark.asyncio
async def test_a_wildcard_scoped_direct_grant_is_included(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "user"},
    )
    mocker.patch(f"{MODULE}.user_crud.get_by_email", return_value=_FakeUser())
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[],
    )
    mocker.patch(
        f"{MODULE}.user_permission_repository.get_active_permissions_for_user",
        new_callable=AsyncMock,
        return_value=[_FakeGrant("policies:read", resource_type="*")],
    )

    result = await current_user_handler.get_current_user("some-token", db=None)

    assert result["permissions"] == ["policies:read"]
