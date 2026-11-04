# Listing and revoking ANOTHER user's passkeys is gated only by the
# users:manage_passkeys permission, plus the usual privileged-target rule.
# Credentials are inserted directly: the WebAuthn ceremony is covered elsewhere.
import os
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import func, select

from backend.mystic_auth.auth.passkeys.passkey_model import PasskeyCredential
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.user.user_crud_collector import user_crud
from backend.mystic_auth.user.user_model import UserRole

from .conftest import (
    PASSWORD,
    create_system_user,
    create_user_with_custom_policy,
    create_verified_user,
    unique_email,
)

NOTIFY = "backend.mystic_auth.auth.passkeys.passkey_operator_service.notify_passkeys_removed_by_operator"


async def _seed(email: str, count: int) -> list[int]:
    async with database.async_session() as db:
        user = await user_crud.get_by_email(email, db)
        rows = [
            PasskeyCredential(
                user_id=user.id, credential_id=os.urandom(16), public_key=b"k", sign_count=0, name=f"Key {i}"
            )
            for i in range(count)
        ]
        db.add_all(rows)
        await db.commit()
        return [row.id for row in rows]


async def _count(email: str) -> int:
    async with database.async_session() as db:
        user = await user_crud.get_by_email(email, db)
        return await db.scalar(
            select(func.count()).select_from(PasskeyCredential).where(PasskeyCredential.user_id == user.id)
        )


async def _make_target(client, created_emails, role=UserRole.user, passkeys=2):
    email = unique_email("passkey-target")
    await create_verified_user(client, created_emails, email, [])
    if role != UserRole.user:
        async with database.async_session() as db:
            await user_crud.update_role(await user_crud.get_by_email(email, db), role, db)
    ids = await _seed(email, passkeys)
    return email, ids


async def _login_as(client, email):
    resp = await client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_holder_can_list_and_revoke_a_users_passkeys_and_user_is_notified(client, created_emails, mocker):
    notify = mocker.patch(NOTIFY, new_callable=AsyncMock)
    target, ids = await _make_target(client, created_emails)
    await create_system_user(client, created_emails, unique_email("operator"))

    listing = await client.get(f"/users/{target}/passkeys")
    assert listing.status_code == 200
    assert {row["id"] for row in listing.json()} == set(ids)
    assert all(set(row) == {"id", "name", "created_at", "last_used_at"} for row in listing.json())

    one = await client.delete(f"/users/{target}/passkeys/{ids[0]}")
    assert one.status_code == 200 and one.json()["removed"] == 1
    everything = await client.delete(f"/users/{target}/passkeys")
    assert everything.json()["removed"] == 1
    assert await _count(target) == 0
    assert notify.await_count == 2

    assert (await client.delete(f"/users/{target}/passkeys")).status_code == 404


@pytest.mark.asyncio
async def test_caller_without_the_permission_is_forbidden_and_nothing_is_removed(client, created_emails):
    target, _ = await _make_target(client, created_emails)
    # user_management-style power over accounts is not enough on its own
    await create_user_with_custom_policy(
        client, created_emails, unique_email("update-any"), ["users:update_any", "users:list_all"], "users"
    )

    assert (await client.get(f"/users/{target}/passkeys")).status_code == 403
    assert (await client.delete(f"/users/{target}/passkeys")).status_code == 403
    assert await _count(target) == 2


@pytest.mark.asyncio
async def test_permission_alone_cannot_touch_a_privileged_target(client, created_emails):
    target, _ = await _make_target(client, created_emails, role=UserRole.admin)
    await create_user_with_custom_policy(
        client, created_emails, unique_email("passkey-only"), ["users:manage_passkeys"], "users"
    )

    resp = await client.delete(f"/users/{target}/passkeys")

    assert resp.status_code == 403
    assert await _count(target) == 2


@pytest.mark.asyncio
async def test_permission_plus_manage_privileged_can_touch_a_privileged_target(client, created_emails):
    target, _ = await _make_target(client, created_emails, role=UserRole.admin)
    await create_user_with_custom_policy(
        client,
        created_emails,
        unique_email("passkey-privileged"),
        ["users:manage_passkeys", "users:manage_privileged"],
        "users",
    )

    assert (await client.delete(f"/users/{target}/passkeys")).json()["removed"] == 2


@pytest.mark.asyncio
async def test_caller_cannot_revoke_their_own_passkeys_here_and_system_account_is_protected(client, created_emails):
    operator = unique_email("operator")
    await create_system_user(client, created_emails, operator)
    await _seed(operator, 1)

    own = await client.delete(f"/users/{operator}/passkeys")
    assert own.status_code == 403 and own.json()["code"] == "CANNOT_MANAGE_OWN_PASSKEYS_HERE"
    assert await _count(operator) == 1

    system_target, _ = await _make_target(client, created_emails, role=UserRole.system, passkeys=1)
    await _login_as(client, operator)
    blocked = await client.delete(f"/users/{system_target}/passkeys")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "SYSTEM_USER_PASSKEYS_CANNOT_BE_MANAGED"


@pytest.mark.asyncio
async def test_removal_is_audited_with_the_acting_user_and_unknown_user_is_404(client, created_emails):
    target, ids = await _make_target(client, created_emails, passkeys=1)
    operator = unique_email("operator")
    await create_system_user(client, created_emails, operator)

    assert (await client.delete(f"/users/{unique_email('nobody')}/passkeys")).status_code == 404
    assert (await client.delete(f"/users/{target}/passkeys/{ids[0]}")).status_code == 200

    from sqlalchemy import text

    async with database.async_session() as db:
        rows = (
            await db.execute(
                text("SELECT metadata FROM security_audit_log WHERE event_type = 'passkey_removed' AND user_email = :e"),
                {"e": target},
            )
        ).all()
    assert rows, "expected a passkey_removed audit row"
    assert str(rows[-1][0]).find(operator) != -1
