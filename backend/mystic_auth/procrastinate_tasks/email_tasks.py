import traceback

from ..emails.email_sender import email_sender
from ..logging.logging_config import get_worker_logger
from .procrastinate_app import ExponentialBackoffWithJitter, app

logger = get_worker_logger(__name__)

# 3 attempts total, waiting min(5 * 2**attempts, 60) seconds (+ jitter)
# between each: same shape as the taskiq SmartRetryMiddleware config this
# replaces. See ExponentialBackoffWithJitter's own docstring.
EMAIL_RETRY = ExponentialBackoffWithJitter(max_attempts=3, base_delay=5, max_delay=60, jitter=3)


# Procrastinate's own docs name BaseRetryStrategy as the documented extension
# point for a custom strategy (see its docstring), but Blueprint.task()'s
# overloads only type `retry` as the concrete `RetryStrategy` dataclass, not
# its own base class - a stub gap in the library, not a real type error here.
#
# `name=` pinned explicitly rather than left to default to the deferring
# caller's own import path (see audit_log_tasks.py's identical comment on
# log_authorization_decision_task for the full explanation): this app's
# runtime and its procrastinate_worker container both import this module as
# `mystic_auth.procrastinate_tasks.email_tasks`, but test code that defers
# this task (password_reset_service.py, account_verification_service.py,
# account_deletion_service.py, all exercised via integration tests rooted at
# `backend.mystic_auth....`) previously registered an unresolvable task name,
# so the real worker logged "TaskNotFound" and silently dropped every email
# job deferred from a test run, with nothing failing loudly since no test
# asserted on the job actually completing.
@app.task(  # type: ignore[call-overload]
    name="mystic_auth.procrastinate_tasks.email_tasks.send_email_task",
    retry=EMAIL_RETRY,
)
async def send_email_task(to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
    """Sends an email via the configured EmailSender. Returns True on success.

    Raises (rather than swallowing the exception) on failure so Procrastinate's
    retry machinery can see it and schedule a retry with backoff: up to 3
    attempts total. Every attempt, including ones that will be retried, logs
    its own full traceback, so a permanent failure that exhausts all retries
    still leaves a clear trail in the logs, not a silently dropped email. A
    permanently-failed job also lands as a row in `procrastinate_jobs` with
    `status='failed'`, queryable directly via SQL: no separate dead-letter
    infrastructure needed.
    """
    logger.info("Sending email to %s", to_email)
    try:
        await email_sender.send(to_email, subject, body, is_html)
        logger.info("Email sent successfully to %s", to_email)
        return True

    except Exception:
        logger.error("Error sending email to %s (will retry if attempts remain):\n%s", to_email, traceback.format_exc())
        raise
