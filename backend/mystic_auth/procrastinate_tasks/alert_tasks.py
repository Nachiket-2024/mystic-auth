import traceback

from ..error_monitoring.security_alert_delivery import send_alert
from ..logging.logging_config import get_worker_logger
from .procrastinate_app import ExponentialBackoffWithJitter, app

logger = get_worker_logger(__name__)

# 5 attempts over roughly a minute and a half: long enough to ride out a brief
# outage of the alert service, short enough that the alert is still useful.
ALERT_RETRY = ExponentialBackoffWithJitter(max_attempts=5, base_delay=3, max_delay=45, jitter=2)

DELIVER_ALERT_TASK_NAME = "mystic_auth.procrastinate_tasks.alert_tasks.deliver_security_alert_task"


@app.task(name=DELIVER_ALERT_TASK_NAME, retry=ALERT_RETRY)
async def deliver_security_alert_task(event_type: str, payload: dict) -> None:
    """Posts one security alert to the webhook, off the request path.

    A slow or dead alert service therefore never holds up a login or a policy
    change. Raises on failure so Procrastinate retries with backoff; after the
    last attempt the job stays as `failed` (see FAILED_JOB_RETENTION_DAYS).
    The payload is metadata only.
    """
    try:
        await send_alert(event_type, payload)
    except Exception:
        logger.error(
            "Security alert delivery failed for %s (will retry if attempts remain):\n%s",
            event_type, traceback.format_exc(),
        )
        raise
