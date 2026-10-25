# PBAC tests for the permissions returned by GET /auth/me.
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError

from backend.mystic_auth.auth.current_user.current_user_handler import (
    current_user_handler,
)
from backend.mystic_auth.core.errors import AppError

from .current_user_test_support import (
    MODULE,
    _FakePolicy,
    _FakeUser,
    _mock_no_direct_grants,
    _patch_identity,
)


@pytest.mark.asyncio
async def test_missing_access_token_returns_stable_unauthorized_error(mocker):
    verify = mocker.patch(f"{MODULE}.jwt_service.verify_token", new_callable=AsyncMock)

    with pytest.raises(AppError) as exc_info:
        await current_user_handler.get_current_user("", db=None)

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.code == "NO_ACCESS_TOKEN"
    verify.assert_not_awaited()


@pytest.mark.parametrize(
    ("payload", "expected_code"),
    [
        (None, "INVALID_OR_EXPIRED_TOKEN"),
        ({"sub": "missing-email"}, "INVALID_TOKEN_PAYLOAD"),
    ],
)
@pytest.mark.asyncio
async def test_invalid_or_incomplete_access_token_returns_unauthorized(
    mocker, payload, expected_code
):
    _patch_identity(mocker, payload=payload)
    lookup = mocker.patch(f"{MODULE}.user_crud.get_by_email", new_callable=AsyncMock)

    with pytest.raises(AppError) as exc_info:
        await current_user_handler.get_current_user("token", db=None)

    assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    assert exc_info.value.code == expected_code
    lookup.assert_not_awaited()


@pytest.mark.parametrize(
    ("user", "expected_status", "expected_code"),
    [
        (None, status.HTTP_401_UNAUTHORIZED, "USER_NOT_FOUND"),
        (_FakeUser(is_active=False), status.HTTP_403_FORBIDDEN, "ACCOUNT_DEACTIVATED"),
    ],
)
@pytest.mark.asyncio
async def test_missing_or_deactivated_account_is_rejected(
    mocker, user, expected_status, expected_code
):
    _patch_identity(mocker, payload={"email": "user@example.com"}, user=user)

    with pytest.raises(AppError) as exc_info:
        await current_user_handler.get_current_user("token", db=None)

    assert exc_info.value.status_code == expected_status
    assert exc_info.value.code == expected_code


@pytest.mark.asyncio
async def test_database_failure_maps_to_safe_database_error(mocker):
    _patch_identity(
        mocker,
        payload={"email": "user@example.com"},
        lookup_error=SQLAlchemyError("private database detail"),
    )

    with pytest.raises(AppError) as exc_info:
        await current_user_handler.get_current_user("token", db=None)

    assert exc_info.value.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert exc_info.value.code == "DATABASE_ERROR"
    assert exc_info.value.detail == "Database error"


@pytest.mark.asyncio
async def test_unexpected_failure_maps_to_safe_internal_error(mocker):
    _patch_identity(mocker, payload={"email": "user@example.com"}, user=_FakeUser())
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        side_effect=RuntimeError("private service detail"),
    )

    with pytest.raises(AppError) as exc_info:
        await current_user_handler.get_current_user("token", db=None)

    assert exc_info.value.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert exc_info.value.code == "INTERNAL_SERVER_ERROR"
    assert exc_info.value.detail == "Internal server error"


@pytest.mark.asyncio
async def test_existing_http_exception_passes_through_unchanged(mocker):
    expected = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Rejected"
    )
    _patch_identity(mocker, token_error=expected)

    with pytest.raises(HTTPException) as exc_info:
        await current_user_handler.get_current_user("token", db=None)

    assert exc_info.value is expected


@pytest.mark.asyncio
async def test_permissions_are_the_union_of_the_users_assigned_policies(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "user"},
    )
    mocker.patch(f"{MODULE}.user_crud.get_by_email", return_value=_FakeUser())
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[
            _FakePolicy(["users:read_own", "users:update_own"]),
            _FakePolicy(["users:list_all"]),
        ],
    )

    _mock_no_direct_grants(mocker)

    result = await current_user_handler.get_current_user("some-token", db=None)

    assert result["permissions"] == [
        "users:list_all",
        "users:read_own",
        "users:update_own",
    ]


@pytest.mark.asyncio
async def test_no_assigned_policies_means_no_permissions(mocker):
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

    _mock_no_direct_grants(mocker)

    result = await current_user_handler.get_current_user("some-token", db=None)

    assert result["permissions"] == []


@pytest.mark.asyncio
async def test_two_users_with_the_same_role_can_have_different_permissions(mocker):
    # The core PBAC claim: identical roles can have different permissions.
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        side_effect=[
            {"email": "admin-a@example.com", "role": "admin"},
            {"email": "admin-b@example.com", "role": "admin"},
        ],
    )
    mocker.patch(
        f"{MODULE}.user_crud.get_by_email",
        side_effect=[
            _FakeUser(email="admin-a@example.com", role="admin"),
            _FakeUser(email="admin-b@example.com", role="admin"),
        ],
    )
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        side_effect=[
            [_FakePolicy(["users:read_own", "users:update_own", "users:list_all"])],
            [_FakePolicy(["users:read_own", "users:update_own"])],
        ],
    )

    _mock_no_direct_grants(mocker)

    result_a = await current_user_handler.get_current_user("token-a", db=None)
    result_b = await current_user_handler.get_current_user("token-b", db=None)

    assert result_a["role"] == result_b["role"] == "admin"
    assert result_a["permissions"] != result_b["permissions"]
    assert "users:list_all" in result_a["permissions"]
    assert "users:list_all" not in result_b["permissions"]


@pytest.mark.asyncio
async def test_policy_actions_for_mismatched_resource_type_are_excluded(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "admin"},
    )
    mocker.patch(
        f"{MODULE}.user_crud.get_by_email", return_value=_FakeUser(role="admin")
    )
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[
            _FakePolicy(["users:read_own"], resource_type="users"),
            _FakePolicy(["policies:delete"], resource_type="users"),
        ],
    )
    _mock_no_direct_grants(mocker)

    result = await current_user_handler.get_current_user("token", db=None)

    assert result["permissions"] == ["users:read_own"]


@pytest.mark.asyncio
async def test_get_current_user_does_not_read_session_count_by_default(mocker):
    _patch_identity(mocker, payload={"email": "user@example.com"}, user=_FakeUser())
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[],
    )
    _mock_no_direct_grants(mocker)
    count_sessions = mocker.patch(
        f"{MODULE}.session_service.count_active_sessions",
        new_callable=AsyncMock,
        return_value=12,
    )

    result = await current_user_handler.get_current_user("token", db=None)

    assert result["active_sessions"] == 0
    count_sessions.assert_not_awaited()
