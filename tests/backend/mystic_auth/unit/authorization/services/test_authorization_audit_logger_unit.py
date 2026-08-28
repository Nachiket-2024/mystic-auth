# tests/backend/mystic_auth/unit/authorization/services/test_authorization_audit_logger_unit.py
#
# authorization_audit_logger.py (build_audit_entry/log_decision) was split
# out of authorization_service.py but had no test exercising its own logic
# directly - every other test in this package only ever mocks it away
# entirely (see AUDIT_MODULE in the sibling test files). Covers:
# build_audit_entry's best-effort resource_identifier extraction (dict vs.
# object vs. neither), and log_decision's "queueing failure must never
# raise" guarantee.
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.authorization.evaluators.authorization_decision import (
    AuthorizationDecision,
)
from backend.mystic_auth.authorization.services.authorization_audit_logger import (
    build_audit_entry,
    log_decision,
)

MODULE = "backend.mystic_auth.authorization.services.authorization_audit_logger"


def _decision(**overrides) -> AuthorizationDecision:
    defaults = {
        "allowed": True,
        "action": "users:read",
        "resource_type": "users",
        "user": "admin@example.com",
        "matched_policies": ["self_service"],
        "rejected_policies": [],
        "failed_conditions": {},
    }
    defaults.update(overrides)
    return AuthorizationDecision(**defaults)


class _ResourceWithEmail:
    email = "target@example.com"


class _ResourceWithId:
    id = 42


def test_build_audit_entry_extracts_identifier_from_a_dict_resource_email():
    entry = build_audit_entry("admin@example.com", "users:read", "users", {"email": "target@example.com"}, None, _decision())
    assert entry["resource_identifier"] == "target@example.com"


def test_build_audit_entry_falls_back_to_dict_id_when_no_email_key():
    entry = build_audit_entry("admin@example.com", "users:read", "users", {"id": 7}, None, _decision())
    assert entry["resource_identifier"] == "7"


def test_build_audit_entry_extracts_identifier_from_an_object_resource():
    entry = build_audit_entry("admin@example.com", "users:read", "users", _ResourceWithEmail(), None, _decision())
    assert entry["resource_identifier"] == "target@example.com"

    entry = build_audit_entry("admin@example.com", "users:read", "users", _ResourceWithId(), None, _decision())
    assert entry["resource_identifier"] == "42"


def test_build_audit_entry_identifier_is_none_when_resource_has_neither():
    entry = build_audit_entry("admin@example.com", "users:read", "users", object(), None, _decision())
    assert entry["resource_identifier"] is None


def test_build_audit_entry_identifier_is_none_when_resource_is_none():
    entry = build_audit_entry("admin@example.com", "users:read", "users", None, None, _decision())
    assert entry["resource_identifier"] is None


def test_build_audit_entry_combines_matched_and_rejected_into_candidates():
    decision = _decision(allowed=False, matched_policies=[], rejected_policies=["office_only"])
    entry = build_audit_entry("admin@example.com", "policies:create", "policies", None, {"ip": "1.2.3.4"}, decision)
    assert entry["candidate_policy_names"] == ["office_only"]
    assert entry["granting_policy_names"] == []
    assert entry["allowed"] is False
    assert entry["context"] == {"ip": "1.2.3.4"}


def test_build_audit_entry_failed_conditions_is_none_when_empty():
    entry = build_audit_entry("admin@example.com", "users:read", "users", None, None, _decision(failed_conditions={}))
    assert entry["failed_conditions"] is None


@pytest.mark.asyncio
async def test_log_decision_queues_the_built_entry(mocker):
    defer_mock = mocker.patch(f"{MODULE}.log_authorization_decision_task.defer_async", new_callable=AsyncMock)

    decision = _decision()
    await log_decision("admin@example.com", "users:read", "users", {"email": "x@example.com"}, {"ip": "1.1.1.1"}, decision)

    defer_mock.assert_called_once()
    entry = defer_mock.call_args.kwargs["entry"]
    assert entry["user_email"] == "admin@example.com"
    assert entry["resource_identifier"] == "x@example.com"


@pytest.mark.asyncio
async def test_log_decision_swallows_a_failure_to_queue_instead_of_raising(mocker):
    """The authorize()/require() choke point every protected route goes
    through must never fail because the audit *write* failed - a real
    decision must still reach the caller."""
    mocker.patch(
        f"{MODULE}.log_authorization_decision_task.defer_async",
        new_callable=AsyncMock,
        side_effect=RuntimeError("procrastinate db is down"),
    )

    # Must not raise.
    await log_decision("admin@example.com", "users:read", "users", None, None, _decision())
