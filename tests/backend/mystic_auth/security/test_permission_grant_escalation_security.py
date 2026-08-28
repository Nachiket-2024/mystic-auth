# tests/backend/mystic_auth/security/test_permission_grant_escalation_security.py
#
# Real-DB proof that AuthorizationService.assert_authorized_to_grant also
# guards direct permission grants (authorization/models/user_permission_model.py),
# both the single-item and bulk routes: a caller holding only
# permissions:grant (never system_superuser itself) must never be able to
# grant - to themselves or anyone else, one at a time or in a bulk batch -
# one of this app's own sensitive actions they don't already hold. Mirrors
# test_privilege_escalation_security.py's policies:assign coverage.
import pytest

from backend.mystic_auth.authorization.policies.default_policies import (
    SELF_SERVICE_POLICY_NAME,
)
from backend.mystic_auth.authorization.repositories.policy_repository import (
    policy_repository,
)
from backend.mystic_auth.database.connection import database

from .conftest import (
    PASSWORD,
    create_system_user,
    create_user_with_custom_policy,
    create_verified_user,
    unique_email,
    unique_policy_name,
)


@pytest.mark.asyncio
async def test_permissions_grant_only_cannot_grant_an_unheld_sensitive_action(client, created_emails):
    email = unique_email("grant-escalate")
    await create_user_with_custom_policy(client, created_emails, email, ["permissions:grant"], resource_type="permissions")

    resp = await client.post(
        f"/authorization/users/{email}/permissions",
        json={"action": "users:purge", "resource_type": "users"},  # sensitive action this caller doesn't hold
    )
    assert resp.status_code == 403

    # Confirm it actually didn't take.
    list_resp = await client.get("/authorization/users/me/permissions")
    assert list_resp.status_code == 200
    assert list_resp.json()["permissions"] == []


@pytest.mark.asyncio
async def test_permissions_grant_only_cannot_self_escalate_to_users_purge_via_bulk_endpoint(
    client, created_emails
):
    """The bulk endpoint's per-item guard must not be skippable just
    because the route-level permissions:grant check passed - the canonical
    real-world attempt: self-escalate through the bulk path instead of the
    single-item one."""
    email = unique_email("bulk-grant-escalate")
    await create_user_with_custom_policy(client, created_emails, email, ["permissions:grant"], resource_type="permissions")

    resp = await client.post(
        "/authorization/bulk/permissions/assign",
        json={"items": [{"user_email": email, "action": "users:purge", "resource_type": "users"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success_count"] == 0
    assert body["error_count"] == 1
    assert body["results"][0]["status"] == "error"

    list_resp = await client.get("/authorization/users/me/permissions")
    assert list_resp.json()["permissions"] == []


@pytest.mark.asyncio
async def test_bulk_permissions_assign_applies_valid_items_even_when_one_item_attempts_escalation(
    client, created_emails
):
    """One item in the batch is a genuine escalation attempt (denied), the
    other is a legitimate grant of an action the caller already holds
    (allowed) - proves the per-item guard doesn't fail the whole batch."""
    email = unique_email("bulk-mixed-escalate")
    # Two policies, since each is scoped to exactly one resource_type:
    # permissions:grant on resource_type="permissions" (route-level gate,
    # see GRANT_DEPENDENCY) and users:list_all on resource_type="users"
    # (the action the second item legitimately grants, which the caller
    # must already hold on that same resource type).
    grant_policy_name = unique_policy_name()
    list_all_policy_name = unique_policy_name()
    async with database.async_session() as session:
        await policy_repository.create(
            {"name": grant_policy_name, "actions": ["permissions:grant"], "resource_type": "permissions", "conditions": None},
            session,
        )
        await policy_repository.create(
            {"name": list_all_policy_name, "actions": ["users:list_all"], "resource_type": "users", "conditions": None},
            session,
        )
    await create_verified_user(
        client, created_emails, email, [SELF_SERVICE_POLICY_NAME, grant_policy_name, list_all_policy_name]
    )

    resp = await client.post(
        "/authorization/bulk/permissions/assign",
        json={"items": [
            {"user_email": email, "action": "users:purge", "resource_type": "users"},
            {"user_email": email, "action": "users:list_all", "resource_type": "users"},
        ]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success_count"] == 1
    assert body["error_count"] == 1
    outcomes = {(r["identifier"]): r["status"] for r in body["results"]}
    assert outcomes["users:purge"] == "error"
    assert outcomes["users:list_all"] == "success"


@pytest.mark.asyncio
async def test_system_superuser_can_still_grant_permissions(client, created_emails):
    """Negative-control, same as the policies:assign equivalent: a genuine
    system_superuser holder is NOT blocked by the same guard."""
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)

    target_email = unique_email("grant-target")
    await create_user_with_custom_policy(client, created_emails, target_email, [], resource_type="users")

    # create_user_with_custom_policy leaves `client` logged in as the
    # target it just created - switch back to the actual system_superuser
    # caller before making the grant request under test.
    await client.post("/auth/login", json={"email": system_email, "password": PASSWORD})

    resp = await client.post(
        f"/authorization/users/{target_email}/permissions",
        json={"action": "users:purge", "resource_type": "users"},
    )
    assert resp.status_code == 200
