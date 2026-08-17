import traceback
from asyncio import sleep
from typing import Any

from redis.exceptions import ConnectionError, ResponseError
from taskiq import AsyncBroker, SmartRetryMiddleware, TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import ListRedisScheduleSource, RedisAsyncResultBackend, RedisStreamBroker

from ..core.settings import settings
from ..emails.email_sender import email_sender
from ..logging.logging_config import get_worker_logger

logger = get_worker_logger(__name__)

result_backend: RedisAsyncResultBackend[Any] = RedisAsyncResultBackend(redis_url=settings.REDIS_URL)

# Stores each retry's due-time in Redis and is polled by the `taskiq_scheduler`
# process, which re-enqueues the task onto `broker` once it's due. Without this,
# SmartRetryMiddleware's delay/backoff labels are silently no-ops (see below).
schedule_source = ListRedisScheduleSource(settings.REDIS_URL)


class ResilientRedisStreamBroker(RedisStreamBroker):
    """Redis Stream broker that recreates its consumer group if Redis loses it."""

    async def listen(self):
        while True:
            try:
                async for message in super().listen():
                    yield message
            except ResponseError as exc:
                if "NOGROUP" not in str(exc):
                    raise

                logger.warning(
                    "Taskiq Redis stream consumer group is missing; re-declaring group before resuming"
                )
                await self._declare_consumer_group()
            except ConnectionError:
                logger.warning("Taskiq Redis connection was closed; reconnecting before resuming")
                await sleep(1)


# SmartRetryMiddleware's delay/backoff labels only take effect when it's given
# a schedule_source: it writes each retry's due-time there instead of
# re-enqueuing immediately, and the `taskiq_scheduler` process (see
# docker-compose's taskiq_scheduler service) polls that source and re-enqueues
# once due. use_jitter avoids every retry of a bulk failure (e.g. an SMTP
# outage) landing on the exact same schedule tick and re-hammering it at once.
broker: AsyncBroker = ResilientRedisStreamBroker(
    url=settings.REDIS_URL,
).with_result_backend(result_backend).with_middlewares(
    SmartRetryMiddleware(
        default_retry_count=3,
        default_delay=5,
        use_delay_exponent=True,
        max_delay_exponent=60,
        use_jitter=True,
        schedule_source=schedule_source,
    )
)

# LabelScheduleSource reads the `schedule=[...]` label taskiq_tasks/
# account_purge_tasks.py's `@broker.task` carries and turns it into a cron
# trigger; schedule_source above is unrelated (it's SmartRetryMiddleware's
# per-retry due-time store, not a cron source), so both are needed.
scheduler = TaskiqScheduler(broker=broker, sources=[schedule_source, LabelScheduleSource(broker)])

# Imported for its side effect: registering account_purge_tasks' labeled
# task on `broker`. Both docker-compose's taskiq_worker and taskiq_scheduler
# services point their command at this module (`email_tasks:broker` /
# `email_tasks:scheduler`), so this is the one place that needs to import it
# for the scheduled purge job to be visible to either process.
from . import account_purge_tasks  # noqa: E402,F401


@broker.task(retry_on_error=True, max_retries=3)
async def send_email_task(to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
    """Sends an email via the configured EmailSender. Returns True on success.

    Raises (rather than swallowing the exception) on failure so
    SmartRetryMiddleware can see it and schedule a re-enqueue with backoff :
    up to 3 attempts total. Every attempt, including ones that will be
    retried, logs its own full traceback, so a permanent failure that
    exhausts all retries still leaves a clear trail in the logs, not a
    silently dropped email.
    """
    logger.info("Sending email to %s", to_email)
    try:
        await email_sender.send(to_email, subject, body, is_html)
        logger.info("Email sent successfully to %s", to_email)
        return True

    except Exception:
        logger.error("Error sending email to %s (will retry if attempts remain):\n%s", to_email, traceback.format_exc())
        raise
