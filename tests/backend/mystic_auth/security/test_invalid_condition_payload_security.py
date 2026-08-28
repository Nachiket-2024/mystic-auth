# tests/backend/mystic_auth/security/test_invalid_condition_payload_security.py
#
# Real-DB proof that invalid policy condition payloads are rejected before
# ever reaching the database (the invalid-payload policy
# Condition Validation: "Must happen before database writes").
import time

import pytest

from backend.mystic_auth.authorization.repositories.policy_repository import (
    policy_repository,
)
from backend.mystic_auth.database.connection import database

from .conftest import create_system_user, unique_email, unique_policy_name

# ---------------------------- Adversarial size/shape ----------------------------
#
# Prior fuzzing covered malformed/adversarial *values* (wrong type, bad
# IP/timezone/date), not adversarial *size or shape*. Before
# condition_validator.py grew _validate_size_and_depth, a resource_attributes/
# context_attributes dict had no cap on key count, nesting depth, or string
# length - only "is a non-empty dict" from its own per-key validator. Manual
# probing against this same real API found: a 150k-key dict was accepted and
# persisted (over a second to write, and every future authorization check
# against that policy would re-walk all 150k entries); a value nested a few
# thousand dicts deep was accepted at write time but then crashed the
# response serializer (PydanticSerializationError: "Circular reference
# detected (depth exceeded)") instead of failing with a clean 422; a
# multi-megabyte string was accepted whole. These tests pin the fix: all
# three must now be rejected fast, as an ordinary 422, well before the
# request could plausibly have reached the database.
_FAST_REJECTION_SECONDS = 2.0


@pytest.mark.asyncio
async def test_huge_key_count_in_resource_attributes_is_rejected_fast(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    huge_dict = {str(i): i for i in range(150_000)}
    start = time.perf_counter()
    resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "actions": ["sectest:view"],
            "resource_type": "sectest_resource",
            "conditions": {"resource_attributes": huge_dict},
        },
    )
    elapsed = time.perf_counter() - start

    assert resp.status_code == 422
    assert elapsed < _FAST_REJECTION_SECONDS, f"took {elapsed:.2f}s to reject, should fail fast"
    async with database.async_session() as session:
        assert await policy_repository.get_by_name(policy_name, session) is None


@pytest.mark.asyncio
async def test_pathologically_deep_nesting_in_resource_attributes_is_rejected_not_crashed(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    nested: object = "leaf"
    for _ in range(5000):
        nested = {"a": nested}

    start = time.perf_counter()
    resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "actions": ["sectest:view"],
            "resource_type": "sectest_resource",
            "conditions": {"resource_attributes": {"field": nested}},
        },
    )
    elapsed = time.perf_counter() - start

    # Must be an ordinary validation rejection, not an unhandled 500 from
    # the response serializer choking on the same structure it was asked
    # to persist.
    assert resp.status_code == 422
    assert elapsed < _FAST_REJECTION_SECONDS, f"took {elapsed:.2f}s to reject, should fail fast"
    async with database.async_session() as session:
        assert await policy_repository.get_by_name(policy_name, session) is None


@pytest.mark.asyncio
async def test_multi_megabyte_string_in_resource_attributes_is_rejected_fast(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    start = time.perf_counter()
    resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "actions": ["sectest:view"],
            "resource_type": "sectest_resource",
            "conditions": {"resource_attributes": {"field": "x" * 5_000_000}},
        },
    )
    elapsed = time.perf_counter() - start

    assert resp.status_code == 422
    assert elapsed < _FAST_REJECTION_SECONDS, f"took {elapsed:.2f}s to reject, should fail fast"
    async with database.async_session() as session:
        assert await policy_repository.get_by_name(policy_name, session) is None


@pytest.mark.asyncio
async def test_reasonably_shaped_conditions_still_pass_the_size_guard(client, created_emails):
    """Pin the negative space of the new guard: an ordinary conditions
    block (well within every cap) must be unaffected."""
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "actions": ["sectest:view"],
            "resource_type": "sectest_resource",
            "conditions": {
                "time": {"start": "09:00", "end": "17:00", "timezone": "UTC"},
                "resource_attributes": {"status": "active", "owner": "someone"},
            },
        },
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_unknown_condition_key_is_rejected_and_never_persisted(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "actions": ["sectest:view"],
            "resource_type": "sectest_resource",
            "conditions": {"totally_made_up_condition": True},
        },
    )

    assert resp.status_code == 422
    async with database.async_session() as session:
        assert await policy_repository.get_by_name(policy_name, session) is None


@pytest.mark.asyncio
async def test_malformed_time_condition_is_rejected(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "actions": ["sectest:view"],
            "resource_type": "sectest_resource",
            "conditions": {"time": "09:00-17:00"},  # must be an object, not a string
        },
    )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_ip_in_network_condition_is_rejected(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "actions": ["sectest:view"],
            "resource_type": "sectest_resource",
            "conditions": {"network": {"allowed_ips": ["not-an-ip-address"]}},
        },
    )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_invalid_timezone_is_rejected(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "actions": ["sectest:view"],
            "resource_type": "sectest_resource",
            "conditions": {"time": {"start": "09:00", "end": "17:00", "timezone": "Not/A_Real_Zone"}},
        },
    )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_existing_policy_conditions_cannot_be_corrupted_via_update(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    policy_name = unique_policy_name()

    create_resp = await client.post(
        "/authorization/policies",
        json={
            "name": policy_name,
            "actions": ["sectest:view"],
            "resource_type": "sectest_resource",
            "conditions": {"self_only": True},
        },
    )
    assert create_resp.status_code == 201

    update_resp = await client.put(
        f"/authorization/policies/{policy_name}",
        json={"conditions": {"date_range": {"start": "not-a-date"}}},
    )
    assert update_resp.status_code == 422

    # Original, valid conditions must be untouched
    get_resp = await client.get(f"/authorization/policies/{policy_name}")
    assert get_resp.json()["conditions"] == {"self_only": True}
