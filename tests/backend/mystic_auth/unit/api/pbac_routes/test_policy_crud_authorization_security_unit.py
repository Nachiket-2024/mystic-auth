# tests/backend/mystic_auth/unit/api/pbac_routes/test_policy_crud_authorization_security_unit.py
#
# Security-review coverage (authorization security review):
# policy create/update/delete must never let a caller grant or keep in
# force one of this app's own sensitive actions (Permission's fixed
# vocabulary) that they do not already hold themselves, and baseline
# policies must be undeletable and unrenameable, all traced to concrete
# privilege-escalation / lockout scenarios below.
#
# Split from the former test_policy_authorization_security_unit.py: this
# half covers policy_crud_routes.py (create/update/delete) plus the shared
# AuthorizationService.assert_authorized_to_grant check they all rely on.
# See test_policy_assignment_authorization_security_unit.py for the
# assign/remove half, matching the same crud vs. assignment route split as
# backend/mystic_auth/api/pbac_routes/.
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.mystic_auth.api.pbac_routes.policy_crud_routes import (
    create_policy,
    delete_policy,
    update_policy,
)
from backend.mystic_auth.authorization.policies.default_policies import (
    SYSTEM_SUPERUSER_POLICY_NAME,
)
from backend.mystic_auth.authorization.schemas.policy_schema import (
    PolicyCreate,
    PolicyUpdate,
)
from backend.mystic_auth.authorization.services.authorization_service import (
    AuthorizationService,
)

SERVICE_MODULE = "backend.mystic_auth.authorization.services.authorization_service"
ROUTES_MODULE = "backend.mystic_auth.api.pbac_routes.policy_crud_routes"

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
# AuthorizationService.assert_authorized_to_grant
# ==================================================================

@pytest.mark.asyncio
async def test_assert_authorized_to_grant_passes_when_caller_holds_all_actions(mocker):
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)

    await AuthorizationService.assert_authorized_to_grant(
        "caller@example.com", ["users:read_own", "users:update_own"], "users", "fake-db"
    )


@pytest.mark.asyncio
async def test_assert_authorized_to_grant_rejects_action_caller_lacks(mocker):
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    with pytest.raises(HTTPException) as exc_info:
        await AuthorizationService.assert_authorized_to_grant(
            "caller@example.com", ["policies:delete"], "policies", "fake-db"
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_assert_authorized_to_grant_ignores_actions_outside_the_app_own_vocabulary(mocker):
    """Arbitrary business-domain actions a downstream app defines for its
    own resources (e.g. "projects:read") are not this app's own sensitive
    actions (Permission's fixed vocabulary) and must not be gated: PBAC
    policy authoring is meant to freely grant whatever a real deployment
    needs for its own resources."""
    authorize_mock = mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    await AuthorizationService.assert_authorized_to_grant(
        "caller@example.com", ["projects:read", "documents:publish"], "projects", "fake-db"
    )

    authorize_mock.assert_not_awaited()


# ==================================================================
# create_policy: cannot mint a policy more powerful than the caller
# ==================================================================

@pytest.mark.asyncio
async def test_create_policy_blocks_minting_action_caller_does_not_hold(mocker):
    """Holding only policies:create (the dependency already satisfied to
    reach this handler) must not be enough to create a policy granting,
    say, users:purge unless the caller already has it."""
    policy_data = PolicyCreate(name="sneaky", actions=["users:purge"], resource_type="users")
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=None)
    create_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.create", new_callable=AsyncMock)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    with pytest.raises(HTTPException) as exc_info:
        await create_policy(policy_data, current_user=CALLER, db="fake-db")

    assert exc_info.value.status_code == 403
    create_mock.assert_not_called()


@pytest.mark.asyncio
async def test_create_policy_allows_when_caller_holds_every_action(mocker):
    policy_data = PolicyCreate(name="fine", actions=["users:read_own"], resource_type="users")
    created = _make_policy(name="fine")
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=None)
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.create", new_callable=AsyncMock, return_value=created)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)

    result = await create_policy(policy_data, current_user=CALLER, db="fake-db")

    assert result is created


@pytest.mark.asyncio
async def test_create_policy_allows_business_domain_actions_regardless_of_caller_holdings(mocker):
    """Pins the scoping decision: a caller with policies:create can create
    a policy for arbitrary downstream business actions (outside this app's
    own Permission vocabulary) even if authorize() would say no for them,
    the check must never even be consulted for such actions."""
    policy_data = PolicyCreate(name="app_policy", actions=["projects:read"], resource_type="projects")
    created = _make_policy(name="app_policy", actions=["projects:read"], resource_type="projects")
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=None)
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.create", new_callable=AsyncMock, return_value=created)
    authorize_mock = mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    result = await create_policy(policy_data, current_user=CALLER, db="fake-db")

    assert result is created
    authorize_mock.assert_not_awaited()


# ==================================================================
# update_policy: cannot re-grant escalated actions, cannot rename baseline
# ==================================================================

@pytest.mark.asyncio
async def test_update_policy_blocks_adding_action_caller_does_not_hold(mocker):
    policy = _make_policy(name="some_policy", actions=["users:read_own"])
    update_data = PolicyUpdate(actions=["users:read_own", "policies:delete"])
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    update_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.update", new_callable=AsyncMock)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    with pytest.raises(HTTPException) as exc_info:
        await update_policy("some_policy", update_data, current_user=CALLER, db="fake-db")

    assert exc_info.value.status_code == 403
    update_mock.assert_not_called()


@pytest.mark.asyncio
async def test_update_policy_allows_non_grant_changes_without_grant_check(mocker):
    """Editing description/conditions, or reactivating (is_active=True),
    must not require the escalation check at all: neither changes what the
    policy grants or who it grants it to. Only actions/resource_type
    changing, or deactivating (is_active=False), does - see the two tests
    below."""
    policy = _make_policy(name="some_policy")
    update_data = PolicyUpdate(description="a clearer description")
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    update_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.update", new_callable=AsyncMock, return_value=policy)
    authorize_mock = mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    await update_policy("some_policy", update_data, current_user=CALLER, db="fake-db")

    authorize_mock.assert_not_awaited()
    update_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_policy_blocks_deactivating_when_caller_lacks_current_actions(mocker):
    """Symmetric guard: deactivating (is_active=False) strips this policy
    from every holder at once, same effective impact as deleting it, so it
    requires holding every action the policy *currently* grants - even
    though no actions/resource_type field is even part of this update."""
    policy = _make_policy(name="some_policy", actions=["users:purge"], resource_type="users")
    update_data = PolicyUpdate(is_active=False)
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    update_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.update", new_callable=AsyncMock)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    with pytest.raises(HTTPException) as exc_info:
        await update_policy("some_policy", update_data, current_user=CALLER, db="fake-db")

    assert exc_info.value.status_code == 403
    update_mock.assert_not_called()


@pytest.mark.asyncio
async def test_update_policy_allows_deactivating_when_caller_holds_current_actions(mocker):
    policy = _make_policy(name="some_policy", actions=["users:read_own"], resource_type="users")
    update_data = PolicyUpdate(is_active=False)
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    update_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.update", new_callable=AsyncMock, return_value=policy)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)
    # is_active=False affects_grants, so update_policy fans out
    # publish_permissions_changed to every current holder - see
    # policy_repository.get_holder_emails's own docstring.
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_holder_emails", new_callable=AsyncMock, return_value=["holder@example.com"])
    publish_mock = mocker.patch(f"{ROUTES_MODULE}.publish_permissions_changed", new_callable=AsyncMock)

    await update_policy("some_policy", update_data, current_user=CALLER, db="fake-db")

    update_mock.assert_awaited_once()
    publish_mock.assert_awaited_once_with("holder@example.com")


@pytest.mark.asyncio
async def test_update_policy_blocks_renaming_baseline_policy(mocker):
    policy = _make_policy(name=SYSTEM_SUPERUSER_POLICY_NAME)
    update_data = PolicyUpdate(name="renamed_superuser")
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    update_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.update", new_callable=AsyncMock)

    with pytest.raises(HTTPException) as exc_info:
        await update_policy(SYSTEM_SUPERUSER_POLICY_NAME, update_data, current_user=CALLER, db="fake-db")

    assert exc_info.value.status_code == 403
    update_mock.assert_not_called()


# ==================================================================
# delete_policy: baseline policies are undeletable
# ==================================================================

@pytest.mark.asyncio
async def test_delete_policy_blocks_deleting_baseline_policy(mocker):
    policy = _make_policy(name=SYSTEM_SUPERUSER_POLICY_NAME)
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    delete_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.delete", new_callable=AsyncMock)

    with pytest.raises(HTTPException) as exc_info:
        await delete_policy(SYSTEM_SUPERUSER_POLICY_NAME, reason=None, current_user=CALLER, db="fake-db")

    assert exc_info.value.status_code == 403
    delete_mock.assert_not_called()


@pytest.mark.asyncio
async def test_delete_policy_blocks_deleting_when_caller_lacks_current_actions(mocker):
    """Symmetric guard: deleting cascades the policy off every holder at
    once, so it requires holding every action the policy currently grants -
    otherwise bare policies:delete could strip an equally- or
    more-privileged peer's access."""
    policy = _make_policy(name="custom_policy", actions=["users:purge"], resource_type="users")
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    delete_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.delete", new_callable=AsyncMock)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=False)

    with pytest.raises(HTTPException) as exc_info:
        await delete_policy("custom_policy", reason=None, current_user=CALLER, db="fake-db")

    assert exc_info.value.status_code == 403
    delete_mock.assert_not_called()


@pytest.mark.asyncio
async def test_delete_policy_allows_deleting_non_baseline_policy(mocker):
    policy = _make_policy(name="custom_policy", actions=["users:read_own"], resource_type="users")
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_by_name", new_callable=AsyncMock, return_value=policy)
    delete_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.delete", new_callable=AsyncMock)
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)
    # A delete always fans out publish_permissions_changed to every current
    # holder - see policy_repository.get_holder_emails's own docstring.
    mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_holder_emails", new_callable=AsyncMock, return_value=["holder@example.com"])
    publish_mock = mocker.patch(f"{ROUTES_MODULE}.publish_permissions_changed", new_callable=AsyncMock)

    await delete_policy("custom_policy", reason=None, current_user=CALLER, db="fake-db")

    delete_mock.assert_awaited_once()
    publish_mock.assert_awaited_once_with("holder@example.com")
