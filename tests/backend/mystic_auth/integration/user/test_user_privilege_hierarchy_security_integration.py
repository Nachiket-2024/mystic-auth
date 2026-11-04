# tests/backend/mystic_auth/integration/user/test_user_privilege_hierarchy_security_integration.py
#
# Regression coverage: the bare user_management policy (users:update_any,
# users:deactivate_any, users:delete_any via user_lifecycle, users:assign_role)
# must not be enough to take over, demote, deactivate, purge or reactivate an
# account that holds the admin role, including setting its password. The
# separate users:manage_privileged action (PBAC, not a role-rank comparison, see
# authorization/privilege_hierarchy.py) is required whenever the target holds the
# admin role. Covers: PUT /users/{email}, PATCH /users/{email}/role,
# DELETE /users/{email}, DELETE /users/{email}/purge,
# PATCH /users/{email}/reactivate.
import pytest
from sqlalchemy import select

from backend.mystic_auth.audit_log.audit_log_model import AuditLog
from backend.mystic_auth.auth.password_logic.password_service import password_service
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.user.user_crud_collector import user_crud

from .user_test_accounts import (
    PASSWORD,
    create_admin,
    create_admin_with_manage_privileged,
    create_verified_user,
    unique_email,
)


@pytest.mark.asyncio
async def test_bare_user_management_cannot_overwrite_an_admins_password(client, created_emails):
    attacker_email = unique_email("attacker")
    target_email = unique_email("target-admin")
    await create_admin(client, created_emails, target_email)
    await create_admin(client, created_emails, attacker_email)

    resp = await client.put(f"/users/{target_email}", json={"password": "Pwned!By#Attacker999"})
    assert resp.status_code == 403
    assert resp.json()["code"] == "INSUFFICIENT_PERMISSIONS"

    async with database.async_session() as session:
        user = await user_crud.get_by_email(target_email, session)
        assert not await password_service.verify_password("Pwned!By#Attacker999", user.hashed_password)


@pytest.mark.asyncio
async def test_bare_user_management_cannot_deactivate_an_admin(client, created_emails):
    attacker_email = unique_email("attacker")
    target_email = unique_email("target-admin")
    await create_admin(client, created_emails, target_email)
    await create_admin(client, created_emails, attacker_email)

    resp = await client.delete(f"/users/{target_email}")
    assert resp.status_code == 403
    assert resp.json()["code"] == "INSUFFICIENT_PERMISSIONS"

    async with database.async_session() as session:
        user = await user_crud.get_by_email(target_email, session)
        assert user.is_active is True
        assert user.deleted_at is None


@pytest.mark.asyncio
async def test_bare_user_management_cannot_purge_an_admin(client, created_emails):
    attacker_email = unique_email("attacker")
    target_email = unique_email("target-admin")
    await create_admin(client, created_emails, target_email)
    await create_admin(client, created_emails, attacker_email)

    resp = await client.delete(f"/users/{target_email}/purge")
    assert resp.status_code == 403
    assert resp.json()["code"] == "INSUFFICIENT_PERMISSIONS"

    async with database.async_session() as session:
        user = await user_crud.get_by_email(target_email, session)
        assert user is not None  # still exists - not purged


@pytest.mark.asyncio
async def test_bare_user_management_cannot_reactivate_a_deactivated_admin(client, created_emails):
    privileged_email = unique_email("privileged")
    attacker_email = unique_email("attacker")
    target_email = unique_email("target-admin")
    await create_admin(client, created_emails, target_email)
    await create_admin_with_manage_privileged(client, created_emails, privileged_email)
    await create_admin(client, created_emails, attacker_email)

    # Deactivate the target first, as the privileged actor - re-login since
    # the last create_admin() call above switched the session to attacker.
    resp = await client.post("/auth/login", json={"email": privileged_email, "password": PASSWORD})
    assert resp.status_code == 200
    resp = await client.delete(f"/users/{target_email}")
    assert resp.status_code == 200

    # Switch to the bare-user_management attacker and attempt reactivate.
    resp = await client.post("/auth/login", json={"email": attacker_email, "password": PASSWORD})
    assert resp.status_code == 200

    resp = await client.patch(f"/users/{target_email}/reactivate")
    assert resp.status_code == 403
    assert resp.json()["code"] == "INSUFFICIENT_PERMISSIONS"

    async with database.async_session() as session:
        user = await user_crud.get_by_email(target_email, session)
        assert user.deleted_at is not None  # still deactivated


@pytest.mark.asyncio
async def test_manage_privileged_holder_can_update_an_admin(client, created_emails):
    actor_email = unique_email("admin-with-manage-privileged")
    target_email = unique_email("target-admin")
    await create_admin(client, created_emails, target_email)
    await create_admin_with_manage_privileged(client, created_emails, actor_email)

    resp = await client.put(f"/users/{target_email}", json={"name": "Renamed By Privileged Actor"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed By Privileged Actor"


@pytest.mark.asyncio
async def test_bare_user_management_can_still_fully_manage_an_ordinary_user(client, created_emails):
    """The fix must not regress the common case: a bare user_management
    grant still needs no extra permission to manage a role=user target.
    (Reactivate isn't covered here - it needs users:reactivate, a separate
    policy user_management doesn't include; unrelated to this fix.)"""
    attacker_email = unique_email("admin")
    target_email = unique_email("ordinary-user")
    await create_verified_user(client, created_emails, target_email)
    await create_admin(client, created_emails, attacker_email)

    resp = await client.put(f"/users/{target_email}", json={"name": "Renamed"})
    assert resp.status_code == 200

    resp = await client.delete(f"/users/{target_email}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_management_field_update_is_logged_to_security_audit_log(client, created_emails):
    """Regression for a second finding in the same audit: PUT
    /users/{email} previously wrote no security_audit_log row at all,
    unlike its sibling routes (role change, deactivate, reactivate)."""
    actor_email = unique_email("admin")
    target_email = unique_email("target")
    await create_verified_user(client, created_emails, target_email)
    await create_admin(client, created_emails, actor_email)

    resp = await client.put(f"/users/{target_email}", json={"name": "Audited Name"})
    assert resp.status_code == 200

    async with database.async_session() as session:
        result = await session.execute(
            select(AuditLog).where(
                AuditLog.user_email == target_email,
                AuditLog.event_type == "user_fields_updated",
            )
        )
        rows = result.scalars().all()
        assert len(rows) == 1
        assert rows[0].event_metadata["updated_by"] == actor_email
        assert rows[0].event_metadata["fields"] == ["name"]
        # Never log the password value itself, only that it changed.
        assert "password" not in str(rows[0].event_metadata)
