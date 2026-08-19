from datetime import UTC, datetime, timedelta

from ..core.settings import settings
from ..database.connection import database
from ..logging.logging_config import get_worker_logger
from ..user_crud.user_crud_collector import user_crud
from ..user_lifecycle.user_purge_service import purge_user_account
from .procrastinate_app import app

logger = get_worker_logger(__name__)


@app.periodic(cron="0 3 * * *")
@app.task
async def purge_expired_soft_deleted_accounts(timestamp: int) -> int:
    """
    Daily hard-purge of accounts that have been soft-deleted (deleted_at set,
    see user_lifecycle_crud.py::soft_delete) for longer than
    settings.ACCOUNT_PURGE_GRACE_DAYS: the automatic counterpart to an
    admin's manual DELETE /users/{email}/purge, giving self-service deletion
    (DELETE /users/me) an actual recovery window instead of either purging
    immediately or never purging at all.

    Runs daily at 03:00 UTC. `@app.periodic` deferred jobs run inside the
    procrastinate worker process itself (PeriodicDeferrer), so there is no
    separate scheduler process for this to depend on. `timestamp` is the
    scheduled cron tick (epoch seconds) Procrastinate calls this with; unused
    here, since the actual cutoff is computed from the current time, not the
    tick time. Goes through the exact same revoke -> audit -> delete
    sequence as the admin purge route via purge_user_account, just with
    "system:grace_period_purge" as the actor instead of an admin's email.
    """
    cutoff = datetime.now(UTC) - timedelta(days=settings.ACCOUNT_PURGE_GRACE_DAYS)

    purged_count = 0
    async with database.async_session() as session:
        expired_users = await user_crud.get_deleted_before(cutoff, session)
        for user in expired_users:
            await purge_user_account(user, session, purged_by="system:grace_period_purge")
            purged_count += 1

    logger.info(
        "Grace-period purge: removed %s account(s) soft-deleted more than %s day(s) ago",
        purged_count, settings.ACCOUNT_PURGE_GRACE_DAYS,
    )
    return purged_count
