# PBAC tests for the permissions returned by GET /auth/me.
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.current_user.current_user_handler import (
    current_user_handler,
)

from .current_user_test_support import (
    MODULE,
    _FakePolicy,
    _FakeUser,
    _mock_no_direct_grants,
)


@pytest.mark.asyncio
async def test_a_user_with_no_role_at_all_is_still_authenticated(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "roleless@example.com", "role": None},
    )
    mocker.patch(
        f"{MODULE}.user_crud.get_by_email",
        return_value=_FakeUser(email="roleless@example.com", role=None),
    )
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[_FakePolicy(["users:read_own", "users:update_own"])],
    )

    _mock_no_direct_grants(mocker)

    result = await current_user_handler.get_current_user("some-token", db=None)

    assert result["email"] == "roleless@example.com"
    assert result["role"] is None
    assert result["permissions"] == ["users:read_own", "users:update_own"]


@pytest.mark.asyncio
async def test_a_user_with_no_role_gets_admin_level_permissions_if_assigned_admin_policies(
    mocker,
):
    # A roleless account isn't limited to "basic" access: it gets exactly
    # whatever its assigned policies grant, same as any other account.
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "roleless-admin@example.com", "role": None},
    )
    mocker.patch(
        f"{MODULE}.user_crud.get_by_email",
        return_value=_FakeUser(email="roleless-admin@example.com", role=None),
    )
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[
            _FakePolicy(["users:list_all", "users:update_any", "users:deactivate_any"])
        ],
    )

    _mock_no_direct_grants(mocker)

    result = await current_user_handler.get_current_user("some-token", db=None)

    assert result["role"] is None
    assert result["permissions"] == [
        "users:deactivate_any",
        "users:list_all",
        "users:update_any",
    ]
