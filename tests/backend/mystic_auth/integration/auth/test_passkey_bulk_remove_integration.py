# Bulk passkey removal against the real app, Postgres and Valkey. Credentials
# are inserted directly: the WebAuthn ceremony itself is covered elsewhere.
import os
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, update

from backend.mystic_auth.auth.passkeys.passkey_model import PasskeyCredential
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.user.user_crud_collector import user_crud
from backend.mystic_auth.user_session.session_model import UserSession

from .auth_test_accounts import signup_verify_login, unique_email


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


@pytest.mark.asyncio
async def test_bulk_remove_deletes_only_the_selected_own_passkeys(client, created_emails):
    email, other = unique_email(), unique_email()
    # The other account's credential must stay untouchable even if its id is sent.
    await signup_verify_login(client, created_emails, other)
    foreign_ids = await _seed(other, 1)
    await signup_verify_login(client, created_emails, email)  # replaces the cookies: now acting as `email`
    mine = await _seed(email, 3)

    response = await client.post("/auth/passkeys/bulk-remove", json={"ids": [mine[0], mine[1], foreign_ids[0]]})

    assert response.status_code == 200
    assert response.json()["removed"] == 2
    assert await _count(email) == 1
    assert await _count(other) == 1


@pytest.mark.asyncio
async def test_bulk_remove_all_then_nothing_left_is_404(client, created_emails):
    email = unique_email()
    await signup_verify_login(client, created_emails, email)
    await _seed(email, 3)

    removed = await client.post("/auth/passkeys/bulk-remove", json={"all": True})
    again = await client.post("/auth/passkeys/bulk-remove", json={"all": True})

    assert removed.json()["removed"] == 3
    assert again.status_code == 404
    assert await _count(email) == 0


@pytest.mark.asyncio
async def test_bulk_remove_requires_step_up_when_the_login_is_old(client, created_emails):
    email = unique_email()
    await signup_verify_login(client, created_emails, email)
    ids = await _seed(email, 2)
    async with database.async_session() as db:
        user = await user_crud.get_by_email(email, db)
        await db.execute(
            update(UserSession)
            .where(UserSession.user_id == user.id)
            .values(created_at=datetime.now(UTC) - timedelta(minutes=20))
        )
        await db.commit()

    blocked = await client.post("/auth/passkeys/bulk-remove", json={"ids": ids})

    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PASSKEY_STEP_UP_REQUIRED"
    assert await _count(email) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [{}, {"all": False}, {"ids": [1], "all": True}, {"ids": []}, {"ids": list(range(11))}])
async def test_bulk_remove_rejects_ambiguous_or_oversized_requests(client, created_emails, body):
    email = unique_email()
    await signup_verify_login(client, created_emails, email)

    assert (await client.post("/auth/passkeys/bulk-remove", json=body)).status_code == 422
