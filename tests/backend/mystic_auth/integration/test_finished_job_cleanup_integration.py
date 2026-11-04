import pytest
from sqlalchemy import text

from backend.mystic_auth.core.settings import settings
from backend.mystic_auth.procrastinate_tasks.maintenance_tasks import (
    purge_old_finished_jobs,
)
from backend.mystic_auth.procrastinate_tasks.procrastinate_app import _worker_defaults
from tests.backend.conftest import superuser_async_session

TASK = "sectest.finished_job_cleanup"


async def _add_job(session, status: str, event_age_days: int | None) -> int:
    job_id = (
        await session.execute(
            text(
                "INSERT INTO procrastinate_jobs (queue_name, task_name, priority, args, status, attempts) "
                "VALUES ('sectest', :task, 0, '{\"entry\": {\"user_email\": \"a@example.com\"}}'::jsonb, "
                "CAST(:status AS procrastinate_job_status), 1) RETURNING id"
            ),
            {"task": TASK, "status": status},
        )
    ).scalar_one()
    if event_age_days is not None:
        await session.execute(
            text(
                "INSERT INTO procrastinate_events (job_id, type, at) "
                "VALUES (:id, 'failed', now() - make_interval(days => :d))"
            ),
            {"id": job_id, "d": event_age_days},
        )
    return job_id


def test_worker_deletes_succeeded_jobs_as_they_finish():
    assert _worker_defaults["delete_jobs"] == "successful"


@pytest.mark.asyncio
async def test_sweep_keeps_recent_failures_and_removes_old_ones_and_leftover_successes():
    old = settings.FAILED_JOB_RETENTION_DAYS + 1
    async with superuser_async_session() as session:
        leftover_success = await _add_job(session, "succeeded", None)
        old_failed = await _add_job(session, "failed", old)
        old_cancelled = await _add_job(session, "cancelled", old)
        recent_failed = await _add_job(session, "failed", 1)
        still_running = await _add_job(session, "doing", old)
        await session.commit()
    ids = [leftover_success, old_failed, old_cancelled, recent_failed, still_running]
    try:
        await purge_old_finished_jobs(timestamp=0)
        async with superuser_async_session() as session:
            left = set(
                (await session.execute(text("SELECT id FROM procrastinate_jobs WHERE id = ANY(:ids)"), {"ids": ids}))
                .scalars()
            )
            events_left = (
                await session.execute(
                    text("SELECT count(*) FROM procrastinate_events WHERE job_id = ANY(:ids)"), {"ids": [old_failed, old_cancelled]}
                )
            ).scalar_one()
        assert left == {recent_failed, still_running}
        assert events_left == 0
    finally:
        async with superuser_async_session() as session:
            await session.execute(text("DELETE FROM procrastinate_jobs WHERE task_name = :t"), {"t": TASK})
            await session.commit()


@pytest.mark.asyncio
async def test_job_left_in_doing_by_a_dead_worker_is_requeued_but_a_live_workers_job_is_not():
    from backend.mystic_auth.procrastinate_tasks.maintenance_tasks import (
        recover_stalled_jobs,
    )

    async with superuser_async_session() as session:
        dead = (await session.execute(text(
            "INSERT INTO procrastinate_workers (last_heartbeat) VALUES (now() - interval '10 minutes') RETURNING id"
        ))).scalar_one()
        live = (await session.execute(text(
            "INSERT INTO procrastinate_workers (last_heartbeat) VALUES (now()) RETURNING id"
        ))).scalar_one()
        stalled = await _add_job(session, "doing", None)
        healthy = await _add_job(session, "doing", None)
        await session.execute(text("UPDATE procrastinate_jobs SET worker_id = :w WHERE id = :j"), {"w": dead, "j": stalled})
        await session.execute(text("UPDATE procrastinate_jobs SET worker_id = :w WHERE id = :j"), {"w": live, "j": healthy})
        await session.commit()
    try:
        await recover_stalled_jobs(timestamp=0)
        async with superuser_async_session() as session:
            status = {
                row.id: row.status
                for row in (await session.execute(
                    text("SELECT id, status FROM procrastinate_jobs WHERE id = ANY(:ids)"), {"ids": [stalled, healthy]}
                ))
            }
        assert status[stalled] == "todo"
        assert status[healthy] == "doing"
    finally:
        async with superuser_async_session() as session:
            await session.execute(text("DELETE FROM procrastinate_jobs WHERE task_name = :t"), {"t": TASK})
            await session.execute(text("DELETE FROM procrastinate_workers WHERE id = ANY(:w)"), {"w": [dead, live]})
            await session.commit()
