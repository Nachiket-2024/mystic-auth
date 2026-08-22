# tests/backend/mystic_auth/unit/api/pbac_routes/test_policy_assignment_authorization_security_unit.py
#
# Security-review coverage (authorization security review):
# assigning/removing a policy must never let a caller hand out (or strip)
# one of this app's own sensitive actions (Permission's fixed vocabulary)
# they do not already hold themselves, and the last system_superuser
# assignment must be irrevocable, all traced to concrete
# privilege-escalation / lockout scenarios below.
#
# Split from the former test_policy_authorization_security_unit.py: this
# half covers policy_assignment_routes.py (assign/remove). See
# test_policy_crud_authorization_security_unit.py for the create/update/
# delete half, matching the same crud vs. assignment route split as
# backend/mystic_auth/api/pbac_routes/.
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.mystic_auth.api.pbac_routes.policy_assignment_routes import (
    assign_policy_to_user,
    remove_policy_from_user,
)
from backend.mystic_auth.authorization.policies.default_policies import (
    SYSTEM_SUPERUSER_POLICY_NAME,
)
from backend.mystic_auth.authorization.schemas.policy_schema import (
    PolicyAssignmentRequest,
)

SERVICE_MODULE = "backend.mystic_auth.authorization.services.authorization_service"
ASSIGNMENT_ROUTES_MODULE = "backend.mystic_auth.api.pbac_routes.policy_assignment_routes"

CALLER = {"email": "caller@example.com", "name": "Caller"}


def _make_policy(**overrides):
    policy = MagicMock()
    policy.id = 1
    policy.name = "some_policy"
    policy.description = "desc"
    policy.actions = ["users:read_own"]
    policy.resource_type = "users"
    policy.conditions = None
    policy.is_active = True
    for key, value in overrides.items():
        setattr(policy, key, value)
    return policy


# ==================================================================
# assign_policy_to_user: cannot hand out a more powerful policy than held
# ==================================================================

@pytest.mark.asyncio
async def test_assign_policy_blocks_self_escalation_to_superuser(mocker):
    """The canonical escalation attempt: a caller holding only
    policies:assign tries to assign themselves system_superuser, which
    they do not otherwise hold."""
    target_user = MagicMock(id=2, email="caller@example.com")
    superuser_policy = _make_policy(
        name=SYSTEM_SUPERUSER_POLICY_NAME,
        actions=["users:assign_system_role", "users:purge", "policies:read"],
        resource_type="*",
    )
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=target_user)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=superuser_policy)
    assign_mock = mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.assign_policy_to_user", new_callable=AsyncMock)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    with pytest.raises(HTTPException) as exc_info:
        await assign_policy_to_user(
            "caller@example.com",
            PolicyAssignmentRequest(policy_name=SYSTEM_SUPERUSER_POLICY_NAME),
            request=None,
            current_user=CALLER, db="fake-db",
        )

    assert exc_info.value.status_code == 403
    assign_mock.assert_not_called()


@pytest.mark.asyncio
async def test_assign_policy_allows_when_caller_already_holds_every_action(mocker):
    target_user = MagicMock(id=2, email="someone@example.com")
    policy = _make_policy(name="self_service", actions=["users:read_own"])
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=target_user)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    assign_mock = mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.assign_policy_to_user", new_callable=AsyncMock)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)

    await assign_policy_to_user(
        "someone@example.com", PolicyAssignmentRequest(policy_name="self_service"),
        request=None,
        current_user=CALLER, db="fake-db",
    )

    assign_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_assign_policy_allows_business_domain_policy_regardless_of_caller_holdings(mocker):
    target_user = MagicMock(id=2, email="someone@example.com")
    app_policy = _make_policy(name="app_policy", actions=["projects:read"], resource_type="projects")
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=target_user)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=app_policy)
    assign_mock = mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.assign_policy_to_user", new_callable=AsyncMock)
    authorize_mock = mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    await assign_policy_to_user(
        "someone@example.com", PolicyAssignmentRequest(policy_name="app_policy"),
        request=None,
        current_user=CALLER, db="fake-db",
    )

    authorize_mock.assert_not_awaited()
    assign_mock.assert_awaited_once()


# ==================================================================
# remove_policy_from_user: cannot strand the system with zero superusers
# ==================================================================

@pytest.mark.asyncio
async def test_remove_policy_blocks_when_caller_lacks_current_actions(mocker):
    """Symmetric guard: without holding what's being revoked, bare
    policies:revoke could strip an equally- or more-privileged peer's
    access - including system_superuser itself - with no escalation check
    at all."""
    target_user = MagicMock(id=2, email="someone@example.com")
    policy = _make_policy(name="custom_policy", actions=["users:purge"], resource_type="users")
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=target_user)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    remove_mock = mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.remove_policy_from_user", new_callable=AsyncMock)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    with pytest.raises(HTTPException) as exc_info:
        await remove_policy_from_user(
            "someone@example.com", "custom_policy", request=None, current_user=CALLER, db="fake-db"
        )

    assert exc_info.value.status_code == 403
    remove_mock.assert_not_called()


@pytest.mark.asyncio
async def test_remove_policy_blocks_removing_last_superuser_assignment(mocker):
    target_user = MagicMock(id=2, email="lastadmin@example.com")
    policy = _make_policy(name=SYSTEM_SUPERUSER_POLICY_NAME, id=7)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=target_user)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.count_assignments", new_callable=AsyncMock, return_value=1)
    remove_mock = mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.remove_policy_from_user", new_callable=AsyncMock)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)

    with pytest.raises(HTTPException) as exc_info:
        await remove_policy_from_user(
            "lastadmin@example.com", SYSTEM_SUPERUSER_POLICY_NAME, request=None, current_user=CALLER, db="fake-db"
        )

    assert exc_info.value.status_code == 409
    remove_mock.assert_not_called()


@pytest.mark.asyncio
async def test_remove_policy_allows_when_other_superusers_remain(mocker):
    target_user = MagicMock(id=2, email="admin2@example.com")
    policy = _make_policy(name=SYSTEM_SUPERUSER_POLICY_NAME, id=7)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=target_user)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.count_assignments", new_callable=AsyncMock, return_value=2)
    remove_mock = mocker.patch(f"{ASSIGNMENT_ROUTES_MODULE}.policy_repository.remove_policy_from_user", new_callable=AsyncMock, return_value=True)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)

    await remove_policy_from_user(
        "admin2@example.com", SYSTEM_SUPERUSER_POLICY_NAME, request=None, current_user=CALLER, db="fake-db"
    )

    remove_mock.assert_awaited_once()
