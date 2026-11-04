import pytest
from pydantic import ValidationError

from backend.mystic_auth.authorization.schemas.policy_schema import (
    POLICY_MAX_ACTIONS,
    PolicyCreate,
    PolicyRead,
    PolicyUpdate,
)


def _create(actions):
    return PolicyCreate(name="p", actions=actions, resource_type="users")


def test_duplicate_actions_are_dropped_keeping_first_seen_order():
    policy = _create(["users:read_own", "users:list_all", "users:read_own", "users:list_all"])
    assert policy.actions == ["users:read_own", "users:list_all"]


def test_update_also_dedupes_and_leaves_omitted_actions_alone():
    assert PolicyUpdate(actions=["a:b", "a:b"]).actions == ["a:b"]
    assert PolicyUpdate(description="x").actions is None


def test_too_many_distinct_actions_are_rejected_on_create_and_update():
    many = [f"users:action_{i}" for i in range(POLICY_MAX_ACTIONS + 1)]
    with pytest.raises(ValidationError):
        _create(many)
    with pytest.raises(ValidationError):
        PolicyUpdate(actions=many)


def test_cap_counts_the_request_so_a_huge_duplicate_list_is_rejected_cheaply():
    with pytest.raises(ValidationError):
        _create(["users:read_own"] * 2000)


def test_exactly_the_cap_is_accepted():
    ok = [f"users:action_{i}" for i in range(POLICY_MAX_ACTIONS)]
    assert len(_create(ok).actions) == POLICY_MAX_ACTIONS


def test_reading_an_older_oversized_policy_still_works():
    row = {
        "name": "legacy", "description": None, "actions": [f"a:{i}" for i in range(150)],
        "resource_type": "users", "conditions": None, "id": 1, "is_active": True,
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
    }
    assert len(PolicyRead(**row).actions) == 150
