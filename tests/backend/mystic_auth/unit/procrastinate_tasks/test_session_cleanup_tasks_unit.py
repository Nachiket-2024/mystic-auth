# tests/backend/mystic_auth/unit/procrastinate_tasks/test_session_cleanup_tasks_unit.py
#
# Mocked-collaborator coverage for the scheduled session-cleanup task's own
# wiring (periodic cron shape, cutoff computed from
# settings.SESSION_ROW_RETENTION_HOURS, delegates to
# session_repository.delete_expired_unrevoked). Real-DB end-to-end behavior
# (only genuinely-expired rows are removed, unexpired ones survive) is
# covered separately in tests/backend/mystic_auth/integration/user_session/
# test_session_row_cleanup_integration.py, same split as
# test_account_purge_tasks_unit.py vs. its own integration coverage.
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.mystic_auth.procrastinate_tasks.procrastinate_app import app
from backend.mystic_auth.procrastinate_tasks.session_cleanup_tasks import (
    purge_consumed_refresh_tokens,
    purge_expired_sessions,
)

MODULE = "backend.mystic_auth.procrastinate_tasks.session_cleanup_tasks"


def _fake_session_cm(mocker, fake_session):
    fake_session_cm = MagicMock()
    fake_session_cm.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session_cm.__aexit__ = AsyncMock(return_value=False)
    mocker.patch(f"{MODULE}.database.async_session", return_value=fake_session_cm)
    return fake_session_cm


def test_session_cleanup_task_is_registered_with_a_daily_cron_schedule():
    key = (purge_expired_sessions.name, "")
    periodic_task = app.periodic_registry.periodic_tasks[key]
    assert periodic_task.cron == "30 3 * * *"


@pytest.mark.asyncio
async def test_session_cleanup_task_deletes_rows_past_the_retention_cutoff(mocker):
    fake_session = MagicMock()
    fake_session_cm = MagicMock()
    fake_session_cm.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session_cm.__aexit__ = AsyncMock(return_value=False)
    mocker.patch(f"{MODULE}.database.async_session", return_value=fake_session_cm)
    mocker.patch(f"{MODULE}.settings.SESSION_ROW_RETENTION_HOURS", 2)

    delete_mock = mocker.patch(
        f"{MODULE}.session_repository.delete_expired_unrevoked", new_callable=AsyncMock, return_value=40
    )

    before_call = datetime.now(UTC) - timedelta(hours=2)
    result = await purge_expired_sessions(timestamp=0)
    after_call = datetime.now(UTC) - timedelta(hours=2)

    assert result == 40
    delete_mock.assert_awaited_once()
    called_cutoff = delete_mock.await_args.args[1]
    assert before_call <= called_cutoff <= after_call


@pytest.mark.asyncio
async def test_session_cleanup_task_returns_zero_when_nothing_has_expired(mocker):
    fake_session = MagicMock()
    fake_session_cm = MagicMock()
    fake_session_cm.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session_cm.__aexit__ = AsyncMock(return_value=False)
    mocker.patch(f"{MODULE}.database.async_session", return_value=fake_session_cm)
    mocker.patch(f"{MODULE}.session_repository.delete_expired_unrevoked", new_callable=AsyncMock, return_value=0)

    result = await purge_expired_sessions(timestamp=0)

    assert result == 0


def test_consumed_refresh_token_cleanup_task_is_registered_with_a_daily_cron_schedule():
    key = (purge_consumed_refresh_tokens.name, "")
    periodic_task = app.periodic_registry.periodic_tasks[key]
    assert periodic_task.cron == "35 3 * * *"


@pytest.mark.asyncio
async def test_consumed_refresh_token_cleanup_deletes_expired_claims_in_one_batch(mocker):
    fake_session = MagicMock()
    fake_session.execute = AsyncMock(return_value=MagicMock(rowcount=42))
    fake_session.commit = AsyncMock()
    _fake_session_cm(mocker, fake_session)

    result = await purge_consumed_refresh_tokens(timestamp=0)

    assert result == 42
    fake_session.execute.assert_awaited_once()
    fake_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_consumed_refresh_token_cleanup_loops_across_full_batches(mocker):
    fake_session = MagicMock()
    fake_session.execute = AsyncMock(
        side_effect=[MagicMock(rowcount=5000), MagicMock(rowcount=200)]
    )
    fake_session.commit = AsyncMock()
    _fake_session_cm(mocker, fake_session)

    result = await purge_consumed_refresh_tokens(timestamp=0)

    assert result == 5200
    assert fake_session.execute.await_count == 2
    assert fake_session.commit.await_count == 2


@pytest.mark.asyncio
async def test_consumed_refresh_token_cleanup_handles_no_rowcount(mocker):
    fake_session = MagicMock()
    fake_session.execute = AsyncMock(return_value=MagicMock(rowcount=None))
    fake_session.commit = AsyncMock()
    _fake_session_cm(mocker, fake_session)

    result = await purge_consumed_refresh_tokens(timestamp=0)

    assert result == 0
