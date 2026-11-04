# tests/backend/mystic_auth/integration/user_crud/test_account_purge_task_integration.py
#
# End-to-end coverage for the scheduled grace-period hard-purge job
# (backend/mystic_auth/procrastinate_tasks/account_purge_tasks.py) against
# the real ASGI app, real PostgreSQL, and real Valkey (see conftest.py).
# Manual purge is covered in test_user_account_lifecycle_integration.py and
# self-delete in test_user_self_service_routes_integration.py; this file
# proves the daily job actually connects the two.
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from backend.mystic_auth.audit_log.audit_log_model import AuditLog
from backend.mystic_auth.audit_log.audit_log_service import ACCOUNT_PURGED
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.procrastinate_tasks.account_purge_tasks import (
    purge_expired_soft_deleted_accounts,
)
from backend.mystic_auth.user.user_crud_collector import user_crud

from .user_test_accounts import (
    create_verified_user,
    post_with_refresh_cookie,
    unique_email,
)


async def _soft_delete_with_deleted_at(email: str, deleted_at: datetime) -> None:
    """Sets deleted_at directly instead of using user_crud.soft_delete (which
    always uses now()), so a test can place an account on either side of the
    grace-period cutoff without waiting real days."""
    async with database.async_session() as session:
        user = await user_crud.get_by_email(email, session)
        user.is_active = False
        user.deleted_at = deleted_at
        session.add(user)
        await session.commit()


@pytest.mark.asyncio
async def test_purge_job_only_purges_accounts_past_the_grace_period(client, created_emails, mocker):
    mocker.patch(
        "backend.mystic_auth.procrastinate_tasks.account_purge_tasks.settings.ACCOUNT_PURGE_GRACE_DAYS", 7
    )

    expired_email = unique_email("expired")
    recent_email = unique_email("recent")
    await create_verified_user(client, created_emails, expired_email)
    await create_verified_user(client, created_emails, recent_email)

    await _soft_delete_with_deleted_at(expired_email, datetime.now(UTC) - timedelta(days=10))
    await _soft_delete_with_deleted_at(recent_email, datetime.now(UTC) - timedelta(days=1))

    purged_count = await purge_expired_soft_deleted_accounts(timestamp=0)
    assert purged_count == 1

    async with database.async_session() as session:
        expired_user = await user_crud.get_by_email(expired_email, session)
        assert expired_user is None  # past the grace period: purged

        recent_user = await user_crud.get_by_email(recent_email, session)
        assert recent_user is not None  # still within the grace period: untouched
        assert recent_user.is_active is False
        assert recent_user.deleted_at is not None


@pytest.mark.asyncio
async def test_purge_job_ignores_accounts_that_were_never_deleted(client, created_emails, mocker):
    mocker.patch(
        "backend.mystic_auth.procrastinate_tasks.account_purge_tasks.settings.ACCOUNT_PURGE_GRACE_DAYS", 0
    )

    email = unique_email()
    await create_verified_user(client, created_emails, email)

    purged_count = await purge_expired_soft_deleted_accounts(timestamp=0)
    assert purged_count == 0

    async with database.async_session() as session:
        user = await user_crud.get_by_email(email, session)
        assert user is not None
        assert user.is_active is True


@pytest.mark.asyncio
async def test_purge_job_revokes_sessions_of_purged_accounts(client, created_emails, mocker):
    mocker.patch(
        "backend.mystic_auth.procrastinate_tasks.account_purge_tasks.settings.ACCOUNT_PURGE_GRACE_DAYS", 7
    )

    email = unique_email()
    login_resp = await create_verified_user(client, created_emails, email)
    refresh_token = login_resp.cookies["refresh_token"]

    await _soft_delete_with_deleted_at(email, datetime.now(UTC) - timedelta(days=10))

    purged_count = await purge_expired_soft_deleted_accounts(timestamp=0)
    assert purged_count == 1

    refresh_resp = await post_with_refresh_cookie(client, "/auth/refresh/", refresh_token)
    assert refresh_resp.status_code == 401


@pytest.mark.asyncio
async def test_purge_job_never_anonymizes_past_history(client, created_emails, mocker):
    """Account deletion (self-service or admin purge) must never erase an
    account's own audit trail: that's the most predictable thing a user who
    just did something malicious does next, and the easiest way for a
    compromised/malicious admin to cover their own tracks via the purge
    route. Both security_audit_log and authorization_audit_log are
    append-only for mystic_auth_app (no UPDATE, no DELETE - see Alembic
    migrations 9c3e7f1a4b8d/4b8d1f6e9c2a), so this isn't just an application
    policy, it's enforced at the database grant level. The account's
    pre-purge history (e.g. its login event) and the ACCOUNT_PURGED row the
    purge itself writes must both still carry the real email afterward."""
    mocker.patch(
        "backend.mystic_auth.procrastinate_tasks.account_purge_tasks.settings.ACCOUNT_PURGE_GRACE_DAYS", 7
    )

    email = unique_email()
    await create_verified_user(client, created_emails, email)  # writes a login_success row for `email`
    await _soft_delete_with_deleted_at(email, datetime.now(UTC) - timedelta(days=10))

    purged_count = await purge_expired_soft_deleted_accounts(timestamp=0)
    assert purged_count == 1

    async with database.async_session() as session:
        result = await session.execute(select(AuditLog).where(AuditLog.event_type == ACCOUNT_PURGED))
        purge_rows = [row for row in result.scalars().all() if row.event_metadata and row.event_metadata.get("purged_by")]
        matching = [row for row in purge_rows if row.user_email == email]
        assert matching, "ACCOUNT_PURGED row for this email is missing or lost its real email"

        result = await session.execute(
            select(AuditLog).where(AuditLog.event_type != ACCOUNT_PURGED, AuditLog.user_email == email)
        )
        pre_purge_rows = result.scalars().all()
        assert pre_purge_rows, "pre-purge history for this email was wiped instead of surviving the purge"
