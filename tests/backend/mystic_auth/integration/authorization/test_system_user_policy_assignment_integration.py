# End-to-end coverage for the system account's policy rules: the baseline
# policies MysticAuth gives it (self_service, user_management,
# system_superuser) cannot be removed through the API, while any other policy
# (a downstream app policy) can be assigned and removed like on any account.
import pytest

from backend.mystic_auth.authorization.policies.default_policies import (
    SYSTEM_USER_BASELINE_POLICY_NAMES,
)
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.user.user_crud_collector import user_crud
from backend.mystic_auth.user.user_model import UserRole

from .authorization_test_accounts import (
    PASSWORD,
    create_system_user,
    unique_email,
    unique_policy_name,
)


async def _setup_system_target_and_admin(client, created_emails):
    """Returns the email of a real role=system account (the target). The
    shared create_system_user helper only grants the baseline policies and
    leaves role="user", so the role is set directly here. A separate
    policy-superuser account is left logged in as the caller."""
    target_email = unique_email("system-target")
    await create_system_user(client, created_emails, target_email)
    async with database.async_session() as session:
        target = await user_crud.get_by_email(target_email, session)
        await user_crud.update(target, {"role": UserRole.system}, session)

    admin_email = unique_email("system-admin")
    await create_system_user(client, created_emails, admin_email)
    await client.post("/auth/login", json={"email": admin_email, "password": PASSWORD})
    return target_email


async def _create_app_policy(client) -> str:
    name = unique_policy_name()
    resp = await client.post(
        "/authorization/policies",
        json={"name": name, "actions": ["users:read_own"], "resource_type": "users"},
    )
    assert resp.status_code == 201
    return name


@pytest.mark.asyncio
async def test_app_policy_can_be_assigned_to_and_removed_from_the_system_user(client, created_emails):
    system_email = await _setup_system_target_and_admin(client, created_emails)
    policy_name = await _create_app_policy(client)
    try:
        assign = await client.post(f"/authorization/users/{system_email}/policies", json={"policy_name": policy_name})
        assert assign.status_code == 200

        held = await client.get(f"/authorization/users/{system_email}/policies")
        assert policy_name in {p["name"] for p in held.json()["policies"]}

        remove = await client.delete(f"/authorization/users/{system_email}/policies/{policy_name}")
        assert remove.status_code == 200
    finally:
        await client.delete(f"/authorization/policies/{policy_name}")


@pytest.mark.asyncio
@pytest.mark.parametrize("baseline_name", SYSTEM_USER_BASELINE_POLICY_NAMES)
async def test_baseline_policies_cannot_be_removed_from_the_system_user(client, created_emails, baseline_name):
    system_email = await _setup_system_target_and_admin(client, created_emails)

    resp = await client.delete(f"/authorization/users/{system_email}/policies/{baseline_name}")

    assert resp.status_code == 403
    assert resp.json()["code"] == "SYSTEM_USER_CANNOT_BE_MODIFIED"
    held = await client.get(f"/authorization/users/{system_email}/policies")
    assert baseline_name in {p["name"] for p in held.json()["policies"]}


@pytest.mark.asyncio
async def test_bulk_policy_route_keeps_baseline_protected_but_allows_app_policy(client, created_emails):
    system_email = await _setup_system_target_and_admin(client, created_emails)
    policy_name = await _create_app_policy(client)
    try:
        resp = await client.post(
            "/authorization/bulk/policies/assign",
            json={"items": [{"user_email": system_email, "policy_name": policy_name}]},
        )
        assert resp.status_code == 200
        assert resp.json()["results"][0]["status"] == "success"

        resp = await client.post(
            "/authorization/bulk/policies/remove",
            json={"items": [
                {"user_email": system_email, "policy_name": policy_name},
                {"user_email": system_email, "policy_name": "user_management"},
            ]},
        )
        results = {r["identifier"]: (r["status"], r.get("error")) for r in resp.json()["results"]}
        assert results[policy_name][0] == "success"
        assert results["user_management"] == ("error", "SYSTEM_USER_CANNOT_BE_MODIFIED")
    finally:
        await client.delete(f"/authorization/policies/{policy_name}")


@pytest.mark.asyncio
async def test_direct_permission_can_be_granted_to_and_revoked_from_the_system_user(client, created_emails):
    system_email = await _setup_system_target_and_admin(client, created_emails)

    grant = await client.post(
        f"/authorization/users/{system_email}/permissions",
        json={"action": "users:list_all", "resource_type": "users"},
    )
    assert grant.status_code == 200

    revoke = await client.delete(
        f"/authorization/users/{system_email}/permissions/users:list_all", params={"resource_type": "users"}
    )
    assert revoke.status_code == 200
