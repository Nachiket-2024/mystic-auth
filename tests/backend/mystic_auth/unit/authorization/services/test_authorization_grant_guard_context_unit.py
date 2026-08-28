# tests/backend/mystic_auth/unit/authorization/services/test_authorization_grant_guard_context_unit.py
#
# assert_authorized_to_grant (authorization_grant_guard.py) re-checks that
# the caller already holds every sensitive action they're about to grant/
# assign/create-a-policy-for, by calling AuthorizationService.authorize
# underneath. That underlying authorize() call evaluates policy conditions
# (network/time/security_context) against a `context` dict - real callers
# (policy_crud_routes.py, policy_assignment_routes.py,
# permission_assignment_routes.py, bulk_policy_routes.py,
# bulk_permission_routes.py, policy_history_routes.py) now build that
# context from the real request (build_authorization_context) and pass it
# through, exactly like their own route-level require_authorization
# dependency does. Before that fix, assert_authorized_to_grant always
# evaluated with context=None, so a caller who genuinely holds a sensitive
# action only via a context-gated policy (e.g. restricted to the office
# network) could never pass this guard at all, even from the exact
# IP/time that would satisfy the policy on a real authorize() call - a
# functional bug (fails closed, not an escalation), covered here.
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.authorization.models.policy_model import Policy
from backend.mystic_auth.authorization.services.authorization_service import (
    authorization_service,
)
from backend.mystic_auth.core.errors import AppError

MODULE = "backend.mystic_auth.authorization.services.authorization_service"
AUDIT_MODULE = "backend.mystic_auth.authorization.services.authorization_audit_logger"


@pytest.fixture(autouse=True)
def _mock_audit_log(mocker):
    """authorize() always queues an audit entry (see
    test_authorization_service_unit.py's own _mock_audit_log) - mocked here
    too so these tests don't reach Procrastinate's real DB connection."""
    return mocker.patch(f"{AUDIT_MODULE}.log_authorization_decision_task.defer_async", new_callable=AsyncMock)


def _office_gated_policy():
    """Grants policies:create, but only from the 10.0.0.0/8 network -
    mirrors test_context_based_authorization_integration.py's own
    office_only fixture, applied to a sensitive (guarded) action instead of
    an arbitrary business one."""
    return Policy(
        name="office_only_policy_admin",
        actions=["policies:create"],
        resource_type="policies",
        conditions={"network": {"allowed_ips": ["10.0.0.0/8"]}},
        is_active=True,
    )


@pytest.mark.asyncio
async def test_grant_guard_denies_a_context_gated_action_when_no_context_is_passed(mocker):
    """Documents the conservative fallback: omitting `context` entirely
    (e.g. a background task with no real request) still fails closed on a
    context-dependent policy, exactly as before this fix - never a
    behavior regression for callers that can't supply one."""
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[_office_gated_policy()],
    )

    with pytest.raises(AppError) as exc_info:
        await authorization_service.assert_authorized_to_grant(
            "admin@example.com", ["policies:create"], "policies", db=None
        )
    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "CANNOT_GRANT_UNHELD_ACTION"


@pytest.mark.asyncio
async def test_grant_guard_allows_a_context_gated_action_when_the_real_context_satisfies_it(mocker):
    """The actual bug fix: passing the request's real context through lets
    a caller who holds policies:create only from the office network
    successfully create/assign a policy granting policies:create, when
    calling from that network."""
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[_office_gated_policy()],
    )

    matching_context = {"ip_address": "10.1.2.3", "current_time": "2026-01-01T12:00:00+00:00", "security_context": {}}

    # Must not raise.
    await authorization_service.assert_authorized_to_grant(
        "admin@example.com", ["policies:create"], "policies", db=None, context=matching_context
    )


@pytest.mark.asyncio
async def test_grant_guard_still_denies_when_the_real_context_does_not_satisfy_the_condition(mocker):
    """Proves this is a genuine per-request re-evaluation, not a blanket
    pass-through once *any* context is supplied: calling from outside the
    office network is still denied even with a fully-formed context."""
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[_office_gated_policy()],
    )

    outside_context = {"ip_address": "203.0.113.50", "current_time": "2026-01-01T12:00:00+00:00", "security_context": {}}

    with pytest.raises(AppError) as exc_info:
        await authorization_service.assert_authorized_to_grant(
            "admin@example.com", ["policies:create"], "policies", db=None, context=outside_context
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_grant_guard_reuses_the_cache_instead_of_re_evaluating_a_repeated_action(mocker):
    """Bulk routes (bulk_policy_routes.py / bulk_permission_routes.py) pass
    a shared dict across many calls in one request loop, keyed by
    (action, resource_type), so the same policy assigned to many users
    only pays for one real evaluation. Proven here by asserting the
    underlying policy lookup - what a real evaluation would trigger - only
    ever runs once across three calls for the identical (action,
    resource_type) pair."""
    get_policies_mock = mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[],
    )

    cache: dict[tuple[str, str], bool] = {}
    for _ in range(3):
        with pytest.raises(AppError):
            await authorization_service.assert_authorized_to_grant(
                "admin@example.com", ["policies:create"], "policies", db=None, cache=cache
            )

    get_policies_mock.assert_called_once()
    assert cache == {("policies:create", "policies"): False}


@pytest.mark.asyncio
async def test_grant_guard_cache_is_scoped_per_action_and_resource_type(mocker):
    """A cache hit must never leak across distinct (action, resource_type)
    pairs - each is evaluated and cached independently."""
    mocker.patch(
        f"{MODULE}.policy_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[_office_gated_policy()],
    )
    matching_context = {"ip_address": "10.1.2.3", "current_time": "2026-01-01T12:00:00+00:00", "security_context": {}}

    cache: dict[tuple[str, str], bool] = {}
    # Allowed: held via the office-gated policy.
    await authorization_service.assert_authorized_to_grant(
        "admin@example.com", ["policies:create"], "policies", db=None, context=matching_context, cache=cache
    )
    # Different action, not held by any policy - must not reuse the prior cache entry.
    with pytest.raises(AppError):
        await authorization_service.assert_authorized_to_grant(
            "admin@example.com", ["policies:delete"], "policies", db=None, context=matching_context, cache=cache
        )

    assert cache == {
        ("policies:create", "policies"): True,
        ("policies:delete", "policies"): False,
    }
