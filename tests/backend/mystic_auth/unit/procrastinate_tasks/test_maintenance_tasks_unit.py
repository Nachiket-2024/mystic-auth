# tests/backend/mystic_auth/unit/procrastinate_tasks/test_maintenance_tasks_unit.py
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

from backend.mystic_auth.procrastinate_tasks.maintenance_tasks import (
    purge_consumed_refresh_tokens,
    purge_expired_passkey_challenges,
    purge_expired_sessions,
)
from backend.mystic_auth.procrastinate_tasks.procrastinate_app import app

MODULE = "backend.mystic_auth.procrastinate_tasks.maintenance_tasks"


def _fake_session_cm(mocker, fake_session):
    fake_session_cm = MagicMock()
    fake_session_cm.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session_cm.__aexit__ = AsyncMock(return_value=False)
    mocker.patch(f"{MODULE}.database.async_session", return_value=fake_session_cm)
    return fake_session_cm


def test_session_cleanup_task_is_registered_with_an_hourly_cron_schedule():
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
        f"{MODULE}.session_repository.delete_expired_unrevoked",
        new_callable=AsyncMock,
        return_value=40,
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
    mocker.patch(
        f"{MODULE}.session_repository.delete_expired_unrevoked",
        new_callable=AsyncMock,
        return_value=0,
    )

    result = await purge_expired_sessions(timestamp=0)

    assert result == 0


def test_consumed_refresh_token_cleanup_task_is_registered_with_an_hourly_cron_schedule():
    key = (purge_consumed_refresh_tokens.name, "")
    periodic_task = app.periodic_registry.periodic_tasks[key]
    assert periodic_task.cron == "35 3 * * *"


@pytest.mark.asyncio
async def test_consumed_refresh_token_cleanup_deletes_expired_claims_in_one_batch(
    mocker,
):
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


def test_passkey_challenge_cleanup_task_is_registered_with_an_hourly_cron_schedule():
    key = (purge_expired_passkey_challenges.name, "")
    periodic_task = app.periodic_registry.periodic_tasks[key]
    assert periodic_task.cron == "40 * * * *"


@pytest.mark.asyncio
async def test_passkey_challenge_cleanup_deletes_expired_rows(mocker):
    fake_session = MagicMock()
    fake_session.execute = AsyncMock(return_value=MagicMock(rowcount=12))
    fake_session.commit = AsyncMock()
    _fake_session_cm(mocker, fake_session)

    result = await purge_expired_passkey_challenges(timestamp=0)

    assert result == 12
    fake_session.execute.assert_awaited_once()
    fake_session.commit.assert_awaited_once()


def test_finished_job_sweep_is_scheduled_daily_after_the_other_sweeps():
    from backend.mystic_auth.procrastinate_tasks.maintenance_tasks import (
        purge_old_finished_jobs,
    )

    assert app.periodic_registry.periodic_tasks[(purge_old_finished_jobs.name, "")].cron == "40 3 * * *"


@pytest.mark.asyncio
async def test_stalled_jobs_are_requeued_then_failed_after_the_attempt_cap(mocker):
    from types import SimpleNamespace

    from backend.mystic_auth.procrastinate_tasks.maintenance_tasks import (
        recover_stalled_jobs,
    )

    fresh = SimpleNamespace(id=1, attempts=0, task_name="a.b.send_email_task")
    last = SimpleNamespace(id=2, attempts=2, task_name="a.b.log_authorization_decision_task")
    mocker.patch.object(app.job_manager, "get_stalled_jobs", AsyncMock(return_value=[fresh, last]))
    retry = mocker.patch.object(app.job_manager, "retry_job_by_id_async", AsyncMock())
    finish = mocker.patch.object(app.job_manager, "finish_job_by_id_async", AsyncMock())
    alert = mocker.patch("backend.mystic_auth.error_monitoring.sentry_service.capture_security_alert", AsyncMock())

    assert await recover_stalled_jobs(timestamp=0) == 2

    assert retry.await_count == 1 and retry.await_args.kwargs["job_id"] == 1
    assert finish.await_count == 1 and finish.await_args.kwargs["job_id"] == 2
    assert finish.await_args.kwargs["delete_job"] is False
    actions = [c.kwargs["metadata"]["action"] for c in alert.await_args_list]
    assert actions == ["requeued", "marked_failed"]
    assert all("args" not in c.kwargs["metadata"] for c in alert.await_args_list)


def test_stalled_job_recovery_runs_every_two_minutes():
    from backend.mystic_auth.procrastinate_tasks.maintenance_tasks import (
        recover_stalled_jobs,
    )

    assert app.periodic_registry.periodic_tasks[(recover_stalled_jobs.name, "")].cron == "*/2 * * * *"
