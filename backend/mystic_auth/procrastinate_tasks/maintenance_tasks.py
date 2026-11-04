from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import delete, text
from sqlalchemy.engine import CursorResult

from ..auth.passkeys.passkey_model import PasskeyChallenge
from ..core.settings import settings
from ..database.connection import database
from ..logging.logging_config import get_worker_logger
from ..user_session.session_repository import session_repository
from .procrastinate_app import app

logger = get_worker_logger(__name__)


@app.periodic(cron="30 3 * * *")
@app.task
async def purge_expired_sessions(timestamp: int) -> int:
    """Daily sweep of user_sessions rows that lapsed via expires_at without
    ever going through an explicit revoke (revoke_by_id/revoke_by_jti/
    revoke_by_chain_id/revoke_all_for_user/revoke_all_for_user_except_chain
    in session_repository.py already delete their rows immediately, so
    there's nothing left for this job to find in that case - this only
    catches a token that simply timed out with no logout call).

    Runs daily at 03:30 UTC, 30 minutes after
    purge_expired_soft_deleted_accounts so the two batch jobs (same worker
    process, both @app.periodic) don't overlap. `timestamp` is the
    scheduled cron tick Procrastinate calls this with; unused here since the
    cutoff is computed from the current time, not the tick time, same
    reasoning as account_purge_tasks.py.

    Safe to delete unconditionally, no per-row confirmation needed (unlike
    the account purge job's Valkey-confirmed revoke): the durable Postgres token-version records, not this table, are the
    source of truth for actual token validity, so a stale row disappearing
    here can never affect a live login/refresh decision.
    """
    cutoff = datetime.now(UTC) - timedelta(hours=settings.SESSION_ROW_RETENTION_HOURS)

    async with database.async_session() as session:
        deleted_count = await session_repository.delete_expired_unrevoked(session, cutoff)

    logger.info(
        "Session cleanup: removed %s row(s) expired more than %s hour(s) ago",
        deleted_count, settings.SESSION_ROW_RETENTION_HOURS,
    )
    return deleted_count


@app.periodic(cron="35 3 * * *")
@app.task
async def purge_consumed_refresh_tokens(timestamp: int) -> int:
    """Delete expired one-time refresh-token claims in bounded batches.

    The primary-key registry is the durable source of truth for refresh
    rotation. Keeping each claim until its JWT expires makes replay checks
    survive Valkey loss; expired tokens can no longer be presented, so their
    claims are safe to remove.
    """
    del timestamp
    deleted_count = 0
    async with database.async_session() as session:
        while True:
            result = await session.execute(
                text(
                    "WITH expired AS ("
                    "  SELECT jti FROM consumed_refresh_tokens "
                    "  WHERE expires_at < now() ORDER BY expires_at LIMIT 5000"
                    ") DELETE FROM consumed_refresh_tokens AS consumed "
                    "USING expired WHERE consumed.jti = expired.jti"
                )
            )
            batch_count = cast(CursorResult, result).rowcount or 0
            await session.commit()
            deleted_count += batch_count
            if batch_count < 5000:
                break

    logger.info("Refresh token rotation cleanup: removed %s expired claim(s)", deleted_count)
    return deleted_count


@app.periodic(cron="40 * * * *")
@app.task
async def purge_expired_passkey_challenges(timestamp: int) -> int:
    """Remove expired WebAuthn challenges after they are no longer replayable."""
    del timestamp
    async with database.async_session() as session:
        result = await session.execute(delete(PasskeyChallenge).where(PasskeyChallenge.expires_at < datetime.now(UTC)))
        await session.commit()
        deleted_count = cast(CursorResult, result).rowcount or 0
    logger.info("Passkey challenge cleanup: removed %s expired challenge(s)", deleted_count)
    return deleted_count


@app.periodic(cron="40 3 * * *")
@app.task
async def purge_old_finished_jobs(timestamp: int) -> int:
    """Daily sweep of procrastinate_jobs.

    Succeeded jobs are deleted by the worker as they finish
    (`delete_jobs="successful"` in procrastinate_app.py); this also removes
    any succeeded rows left from before that setting, and deletes failed,
    aborted and cancelled jobs once they are older than
    FAILED_JOB_RETENTION_DAYS. Age is the time of the job's last event, so a
    job that keeps retrying is not removed early. Events go with the job
    (ON DELETE CASCADE).
    """
    del timestamp
    cutoff = datetime.now(UTC) - timedelta(days=settings.FAILED_JOB_RETENTION_DAYS)
    deleted_count = 0
    async with database.async_session() as session:
        while True:
            result = await session.execute(
                text(
                    "WITH doomed AS ("
                    "  SELECT j.id FROM procrastinate_jobs j "
                    "  WHERE j.status = 'succeeded' "
                    "     OR (j.status IN ('failed', 'aborted', 'cancelled') AND COALESCE("
                    "         (SELECT max(e.at) FROM procrastinate_events e WHERE e.job_id = j.id), "
                    "         j.scheduled_at) < :cutoff) "
                    "  ORDER BY j.id LIMIT 5000"
                    ") DELETE FROM procrastinate_jobs AS jobs USING doomed WHERE jobs.id = doomed.id"
                ),
                {"cutoff": cutoff},
            )
            batch_count = cast(CursorResult, result).rowcount or 0
            await session.commit()
            deleted_count += batch_count
            if batch_count < 5000:
                break

    logger.info(
        "Job cleanup: removed %s finished job(s) (failed/aborted/cancelled older than %s day(s))",
        deleted_count, settings.FAILED_JOB_RETENTION_DAYS,
    )
    return deleted_count


@app.periodic(cron="*/2 * * * *")
@app.task
async def recover_stalled_jobs(timestamp: int) -> int:
    """Re-queue jobs whose worker died while running them.

    A job in `doing` whose worker stopped sending heartbeats (killed, OOM,
    host restart) would otherwise stay there forever: it never retries and
    nobody hears about it. Every two minutes this finds those jobs and puts
    each back in the queue, up to STALLED_JOB_MAX_ATTEMPTS runs in total;
    after that it is marked failed, where the failed-job retention rules and
    alert apply. Every recovery raises a metadata-only alert.

    Delivery is at least once: a worker that died after doing the work but
    before recording it makes the retry run the work again. Email tasks can
    therefore send a duplicate in that rare case; the audit-write task is a
    plain insert of one decision.
    """
    del timestamp
    from procrastinate import jobs as procrastinate_jobs

    from ..error_monitoring.sentry_service import capture_security_alert

    stalled = list(await app.job_manager.get_stalled_jobs(seconds_since_heartbeat=90))
    recovered = 0
    for job in stalled:
        if job.id is None:
            continue
        exhausted = job.attempts + 1 >= settings.STALLED_JOB_MAX_ATTEMPTS
        if exhausted:
            await app.job_manager.finish_job_by_id_async(
                job_id=job.id, status=procrastinate_jobs.Status.FAILED, delete_job=False
            )
        else:
            await app.job_manager.retry_job_by_id_async(job_id=job.id, retry_at=datetime.now(UTC))
        recovered += 1
        await capture_security_alert(
            "background_job_stalled",
            metadata={
                "task": job.task_name.rsplit(".", 1)[-1],
                "job_id": job.id,
                "attempts": job.attempts,
                "action": "marked_failed" if exhausted else "requeued",
            },
        )
        logger.warning("Stalled job %s (%s) %s", job.id, job.task_name, "marked failed" if exhausted else "re-queued")

    return recovered
