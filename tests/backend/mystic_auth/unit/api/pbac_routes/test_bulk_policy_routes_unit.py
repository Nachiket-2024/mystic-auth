# tests/backend/mystic_auth/unit/api/pbac_routes/test_bulk_policy_routes_unit.py
#
# Security-review coverage for bulk_policy_routes.py's bulk_remove_policies:
# unlike the single-item remove_policy_from_user/revoke_policy_action_from_user
# routes (see test_policy_assignment_authorization_security_unit.py), a bulk
# request commits every item in one pass, so the DB's system_superuser
# holder count never shrinks between items within the same batch the way it
# would across separate requests. This suite mocks
# policy_repository.get_holder_emails_for_update (the actual holder set,
# not just a
# count - a batch item targeting a non-holder must not count against the
# lockout) to prove the route tracks how many system_superuser removals it
# has already staged *within the batch itself* and refuses the one that
# would leave zero holders, rather than only ever checking a stale
# pre-batch count.
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.mystic_auth.api.pbac_routes.bulk.bulk_policy_routes import (
    bulk_remove_policies,
)
from backend.mystic_auth.authorization.policies.default_policies import (
    SYSTEM_SUPERUSER_POLICY_NAME,
)
from backend.mystic_auth.authorization.schemas.bulk_schema import (
    BulkItemResult,
    BulkPolicyItem,
    BulkPolicyRequest,
)

ROUTES_MODULE = "backend.mystic_auth.api.pbac_routes.bulk.bulk_policy_routes"
SERVICE_MODULE = "backend.mystic_auth.authorization.services.authorization_service"

CALLER = {"email": "caller@example.com", "name": "Caller"}


def _make_policy(name=SYSTEM_SUPERUSER_POLICY_NAME, **overrides):
    policy = MagicMock()
    policy.id = 1
    policy.name = name
    policy.actions = ["policies:read"]
    policy.resource_type = "*"
    for key, value in overrides.items():
        setattr(policy, key, value)
    return policy


def _make_user(email):
    user = MagicMock()
    user.id = hash(email) % 10_000
    user.email = email
    return user


async def _fake_bulk_remove(valid_items, db):
    return [
        BulkItemResult(user_email=user.email, identifier=policy.name, status="success")
        for user, policy in valid_items
    ]


@pytest.mark.asyncio
async def test_bulk_remove_blocks_only_the_item_that_would_leave_zero_superuser_holders(mocker):
    """Two holders total. A batch that targets both must let the first
    removal through and block the second - not let both through just
    because each item's own escalation guard passes independently."""
    superuser_policy = _make_policy()
    target_a, target_b = _make_user("a@example.com"), _make_user("b@example.com")

    mocker.patch(
        f"{ROUTES_MODULE}.user_crud.get_by_emails", new_callable=AsyncMock,
        return_value={target_a.email: target_a, target_b.email: target_b},
    )
    mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.get_policies_by_names", new_callable=AsyncMock,
        return_value={SYSTEM_SUPERUSER_POLICY_NAME: superuser_policy},
    )
    mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.get_holder_emails_for_update", new_callable=AsyncMock,
        return_value=[target_a.email, target_b.email],
    )
    remove_mock = mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.bulk_remove_policies", new_callable=AsyncMock, side_effect=_fake_bulk_remove
    )
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)

    body = BulkPolicyRequest(items=[
        BulkPolicyItem(user_email=target_a.email, policy_name=SYSTEM_SUPERUSER_POLICY_NAME),
        BulkPolicyItem(user_email=target_b.email, policy_name=SYSTEM_SUPERUSER_POLICY_NAME),
    ])

    result = await bulk_remove_policies(body, MagicMock(), current_user=CALLER, db=MagicMock())

    statuses = {r.user_email: (r.status, r.error) for r in result.results}
    assert statuses[target_a.email] == ("success", None)
    assert statuses[target_b.email] == ("error", "CANNOT_REMOVE_LAST_SUPERUSER_ASSIGNMENT")

    # Only the surviving item was actually handed to the repository.
    (valid_items_arg, _db_arg), _kwargs = remove_mock.call_args
    assert [user.email for user, _policy in valid_items_arg] == [target_a.email]


@pytest.mark.asyncio
async def test_bulk_remove_allows_all_items_when_enough_superuser_holders_remain(mocker):
    superuser_policy = _make_policy()
    target_a, target_b = _make_user("a@example.com"), _make_user("b@example.com")

    mocker.patch(
        f"{ROUTES_MODULE}.user_crud.get_by_emails", new_callable=AsyncMock,
        return_value={target_a.email: target_a, target_b.email: target_b},
    )
    mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.get_policies_by_names", new_callable=AsyncMock,
        return_value={SYSTEM_SUPERUSER_POLICY_NAME: superuser_policy},
    )
    # Three holders total, only two targeted - at least one survives either way.
    mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.get_holder_emails_for_update", new_callable=AsyncMock,
        return_value=[target_a.email, target_b.email, "c@example.com"],
    )
    remove_mock = mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.bulk_remove_policies", new_callable=AsyncMock, side_effect=_fake_bulk_remove
    )
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)

    body = BulkPolicyRequest(items=[
        BulkPolicyItem(user_email=target_a.email, policy_name=SYSTEM_SUPERUSER_POLICY_NAME),
        BulkPolicyItem(user_email=target_b.email, policy_name=SYSTEM_SUPERUSER_POLICY_NAME),
    ])

    result = await bulk_remove_policies(body, MagicMock(), current_user=CALLER, db=MagicMock())

    assert {r.status for r in result.results} == {"success"}
    (valid_items_arg, _db_arg), _kwargs = remove_mock.call_args
    assert {user.email for user, _policy in valid_items_arg} == {target_a.email, target_b.email}


@pytest.mark.asyncio
async def test_bulk_remove_non_holder_item_does_not_inflate_the_lockout_counter(mocker):
    """Regression test: three real holders (a, b, c). A batch that targets
    [a, d (never held it), b] must let BOTH a and b through, since c would
    still remain as a holder either way - d's no-op removal attempt must
    not count against the lockout and wrongly block b's legitimate one."""
    superuser_policy = _make_policy()
    target_a, target_b, target_d = (
        _make_user("a@example.com"), _make_user("b@example.com"), _make_user("d@example.com")
    )

    mocker.patch(
        f"{ROUTES_MODULE}.user_crud.get_by_emails", new_callable=AsyncMock,
        return_value={target_a.email: target_a, target_b.email: target_b, target_d.email: target_d},
    )
    mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.get_policies_by_names", new_callable=AsyncMock,
        return_value={SYSTEM_SUPERUSER_POLICY_NAME: superuser_policy},
    )
    # d is NOT in the holder set - a and b (plus an unlisted c) are the three
    # real holders.
    mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.get_holder_emails_for_update", new_callable=AsyncMock,
        return_value=[target_a.email, target_b.email, "c@example.com"],
    )
    remove_mock = mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.bulk_remove_policies", new_callable=AsyncMock, side_effect=_fake_bulk_remove
    )
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)

    body = BulkPolicyRequest(items=[
        BulkPolicyItem(user_email=target_a.email, policy_name=SYSTEM_SUPERUSER_POLICY_NAME),
        BulkPolicyItem(user_email=target_d.email, policy_name=SYSTEM_SUPERUSER_POLICY_NAME),
        BulkPolicyItem(user_email=target_b.email, policy_name=SYSTEM_SUPERUSER_POLICY_NAME),
    ])

    result = await bulk_remove_policies(body, MagicMock(), current_user=CALLER, db=MagicMock())

    # Both real holders (a, b) reach the repository - d is a non-holder so
    # the repository layer itself would separately report it not_held, but
    # the route-level lockout guard must not reject b just because d was
    # also in the batch.
    (valid_items_arg, _db_arg), _kwargs = remove_mock.call_args
    assert {user.email for user, _policy in valid_items_arg} == {target_a.email, target_d.email, target_b.email}
    statuses = {r.user_email: r.status for r in result.results}
    assert statuses[target_a.email] == "success"
    assert statuses[target_b.email] == "success"


@pytest.mark.asyncio
async def test_bulk_remove_of_non_superuser_policy_is_unaffected_by_the_lockout_guard(mocker):
    other_policy = _make_policy(name="user_administration")
    target = _make_user("a@example.com")

    mocker.patch(
        f"{ROUTES_MODULE}.user_crud.get_by_emails", new_callable=AsyncMock, return_value={target.email: target}
    )
    mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.get_policies_by_names", new_callable=AsyncMock,
        return_value={"user_administration": other_policy},
    )
    holder_emails_mock = mocker.patch(f"{ROUTES_MODULE}.policy_repository.get_holder_emails_for_update", new_callable=AsyncMock)
    remove_mock = mocker.patch(
        f"{ROUTES_MODULE}.policy_repository.bulk_remove_policies", new_callable=AsyncMock, side_effect=_fake_bulk_remove
    )
    mocker.patch(f"{SERVICE_MODULE}.AuthorizationService.authorize", new_callable=AsyncMock, return_value=True)

    body = BulkPolicyRequest(items=[BulkPolicyItem(user_email=target.email, policy_name="user_administration")])

    result = await bulk_remove_policies(body, MagicMock(), current_user=CALLER, db=MagicMock())

    assert result.results[0].status == "success"
    holder_emails_mock.assert_not_called()
    (valid_items_arg, _db_arg), _kwargs = remove_mock.call_args
    assert [user.email for user, _policy in valid_items_arg] == [target.email]
