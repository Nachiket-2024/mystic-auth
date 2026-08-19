# tests/backend/mystic_auth/unit/procrastinate_tasks/test_account_purge_tasks_unit.py
#
# Mocked-collaborator coverage for the scheduled purge task's own wiring
# (periodic cron shape, which CRUD/service calls it makes and with what
# args). The real-DB end-to-end behavior (grace period actually filters
# correctly, sessions actually get revoked) is covered separately in
# tests/backend/mystic_auth/integration/user_crud/test_account_purge_task_integration.py,
# same split as test_email_tasks_unit.py vs. the email-sending integration
# coverage.
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.mystic_auth.procrastinate_tasks.account_purge_tasks import (
    purge_expired_soft_deleted_accounts,
)
from backend.mystic_auth.procrastinate_tasks.procrastinate_app import app

MODULE = "backend.mystic_auth.procrastinate_tasks.account_purge_tasks"


def test_purge_task_is_registered_with_a_daily_cron_schedule():
    key = (purge_expired_soft_deleted_accounts.name, "")
    periodic_task = app.periodic_registry.periodic_tasks[key]
    assert periodic_task.cron == "0 3 * * *"


@pytest.mark.asyncio
async def test_purge_task_purges_every_account_returned_by_get_deleted_before(mocker):
    fake_session = MagicMock()
    fake_session_cm = MagicMock()
    fake_session_cm.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session_cm.__aexit__ = AsyncMock(return_value=False)
    mocker.patch(f"{MODULE}.database.async_session", return_value=fake_session_cm)

    user_a, user_b = object(), object()
    get_deleted_before_mock = mocker.patch(
        f"{MODULE}.user_crud.get_deleted_before", new_callable=AsyncMock, return_value=[user_a, user_b]
    )
    purge_mock = mocker.patch(f"{MODULE}.purge_user_account", new_callable=AsyncMock)

    result = await purge_expired_soft_deleted_accounts(timestamp=0)

    assert result == 2
    get_deleted_before_mock.assert_awaited_once()
    assert purge_mock.await_count == 2
    purge_mock.assert_any_await(user_a, fake_session, purged_by="system:grace_period_purge")
    purge_mock.assert_any_await(user_b, fake_session, purged_by="system:grace_period_purge")


@pytest.mark.asyncio
async def test_purge_task_returns_zero_when_nothing_is_past_the_grace_period(mocker):
    fake_session = MagicMock()
    fake_session_cm = MagicMock()
    fake_session_cm.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session_cm.__aexit__ = AsyncMock(return_value=False)
    mocker.patch(f"{MODULE}.database.async_session", return_value=fake_session_cm)
    mocker.patch(f"{MODULE}.user_crud.get_deleted_before", new_callable=AsyncMock, return_value=[])
    purge_mock = mocker.patch(f"{MODULE}.purge_user_account", new_callable=AsyncMock)

    result = await purge_expired_soft_deleted_accounts(timestamp=0)

    assert result == 0
    purge_mock.assert_not_awaited()
