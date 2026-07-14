import aiosmtplib
from email.message import EmailMessage
import traceback

from taskiq import AsyncBroker
from taskiq_redis import RedisStreamBroker, RedisAsyncResultBackend

from ..core.settings import settings
from ..logging.logging_config import get_logger

logger = get_logger(__name__)

result_backend = RedisAsyncResultBackend(redis_url=settings.REDIS_URL)

broker: AsyncBroker = RedisStreamBroker(
    url=settings.REDIS_URL,
).with_result_backend(result_backend)


@broker.task
async def send_email_task(to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
    """Sends an email via Gmail SMTP. Returns True on success, False on any failure."""
    try:
        message = EmailMessage()
        message["From"] = settings.FROM_EMAIL
        message["To"] = to_email
        message["Reply-To"] = settings.SUPPORT_EMAIL or settings.FROM_EMAIL
        message["Subject"] = subject

        if is_html:
            message.set_content(body, subtype="html")
        else:
            message.set_content(body)

        await aiosmtplib.send(
            message,
            hostname="smtp.gmail.com",
            port=587,
            start_tls=True,
            username=settings.FROM_EMAIL,
            password=settings.GMAIL_APP_PASSWORD
        )

        logger.info("Email sent successfully to %s", to_email)
        return True

    except Exception:
        logger.error("Error sending email to %s:\n%s", to_email, traceback.format_exc())
        return False
