"""Procrastinate App + connector setup, split from the task modules so the
`procrastinate.App` instance exists before any `@app.task`/`@app.periodic`
decorator runs. `email_tasks.py` and `account_purge_tasks.py` both import
`app` from here rather than from each other, avoiding the circular import a
single shared module would otherwise create between them.
"""
import random

from procrastinate import App, PsycopgConnector
from procrastinate.jobs import Job
from procrastinate.retry import BaseRetryStrategy, RetryDecision

from ..core.settings import settings


class ExponentialBackoffWithJitter(BaseRetryStrategy):
    """Retries `max_attempts` times total, waiting `min(base_delay * 2**attempts,
    max_delay)` seconds plus a random `[0, jitter]` second offset before each
    retry. Mirrors the shape of the taskiq `SmartRetryMiddleware` config this
    replaces (`default_retry_count=3, default_delay=5, use_delay_exponent=True,
    max_delay_exponent=60, use_jitter=True`): the jitter keeps many
    simultaneously-failing jobs (e.g. an SMTP outage) from all retrying on the
    exact same tick and re-hammering an already-struggling dependency at once.
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
    ],
)
