"""Procrastinate App + connector setup, split from the task modules so the
`procrastinate.App` instance exists before any `@app.task`/`@app.periodic`
decorator runs. `email_tasks.py` and `account_purge_tasks.py` both import
`app` from here rather than from each other, avoiding the circular import a
single shared module would otherwise create between them.
"""
import logging
import random

from procrastinate import App, PsycopgConnector
from procrastinate.jobs import Job
from procrastinate.retry import BaseRetryStrategy, RetryDecision

from ..core.settings import settings

# Procrastinate logs each job's full call args at INFO - for send_email_task
# that's the rendered body, which embeds a raw token. WARNING keeps failure
# visibility (still ERROR) while dropping that from stdout.
logging.getLogger("procrastinate").setLevel(logging.WARNING)


class ExponentialBackoffWithJitter(BaseRetryStrategy):
    """Retries `max_attempts` times total, waiting `min(base_delay * 2**attempts,
    max_delay)` seconds plus a random `[0, jitter]` second offset before each
    retry. The jitter keeps many simultaneously-failing jobs (e.g. an SMTP
    outage) from all retrying on the same tick and re-hammering an
    already-struggling dependency at once.
    """

    def __init__(self, *, max_attempts: int, base_delay: float, max_delay: float, jitter: float):
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter = jitter

    def get_retry_decision(self, *, exception: BaseException, job: Job) -> RetryDecision | None:
        if job.attempts >= self.max_attempts:
            return None
        delay = min(self.base_delay * (2**job.attempts), self.max_delay)
        delay += random.uniform(0, self.jitter)  # nosec B311 - retry backoff jitter, not security/crypto use
        return RetryDecision(retry_in={"seconds": delay})


# Procrastinate needs a bare postgresql:// DSN; DATABASE_URL is SQLAlchemy's
# postgresql+asyncpg:// dialect. settings.procrastinate_database_url
# translates it. This connector opens its own psycopg connection pool,
# entirely separate from the SQLAlchemy engine database.py builds.
connector = PsycopgConnector(
    conninfo=settings.procrastinate_database_url,
    min_size=1,
    max_size=10,
)

app = App(
    connector=connector,
    import_paths=[
        "mystic_auth.procrastinate_tasks.email_tasks",
        "mystic_auth.procrastinate_tasks.account_purge_tasks",
        "mystic_auth.procrastinate_tasks.audit_log_tasks",
    ],
)
