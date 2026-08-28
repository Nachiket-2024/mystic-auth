import traceback

from ..database.connection import database
from ..logging.logging_config import get_worker_logger
from .procrastinate_app import ExponentialBackoffWithJitter, app

logger = get_worker_logger(__name__)

# 3 attempts total, waiting min(2 * 2**attempts, 20) seconds (+ jitter)
# between each: shorter/faster than EMAIL_RETRY (email_tasks.py) since a
# stuck audit write should surface quickly rather than sit for up to a
# minute, but still enough attempts to ride out a brief Postgres blip.
AUDIT_LOG_RETRY = ExponentialBackoffWithJitter(max_attempts=3, base_delay=2, max_delay=20, jitter=2)


# `name=` is pinned explicitly, same reasoning as email_tasks.py: test code
# imports this task under a different root than the real worker, and an
# unpinned name would register a job the worker can't resolve
# ("TaskNotFound").
@app.task(  # type: ignore[call-overload]
    name="mystic_auth.procrastinate_tasks.audit_log_tasks.log_authorization_decision_task",
    retry=AUDIT_LOG_RETRY,
)
async def log_authorization_decision_task(entry: dict) -> None:
    """
    Persists one authorization-decision audit row (see
    authorization_audit_logger.build_audit_entry for the row shape), off the
    request path: authorization_audit_logger.log_decision defers this instead of
    writing the row itself, so a protected route's response no longer waits
    on the audit-log commit (see concerns.md's now-resolved "audit logging
    blocks every protected request" entry).

    Runs against `database`'s own SQLAlchemy engine (a fresh session per
    job, opened here), not the request's session: by the time a worker picks
    this job up, the request that produced `entry` has already returned and
    its session is long closed. If this exhausts all retries, the row lands
    as a `status='failed'` job in `procrastinate_jobs`, inspectable directly
    via SQL, same as email_tasks.py's send_email_task; the authorization
    decision itself was never at risk, only its audit trail entry.
    """
    # Imported here, not at module scope: avoids a circular import between
    # this module and authorization_service.py, which itself defers into
    # this task (procrastinate_app -> audit_log_tasks -> authorization
    # package -> audit_log_repository, none of which need to import this
    # task module back).
    from ..authorization.repositories.audit_log_repository import audit_log_repository

    try:
        async with database.async_session() as session:
            await audit_log_repository.create_entries([entry], session)
    except Exception:
        logger.error(
            "Error writing authorization audit log entry (will retry if attempts remain):\n%s",
            traceback.format_exc(),
        )
        raise
