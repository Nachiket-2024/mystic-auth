from email.message import EmailMessage
from typing import Protocol

import aiosmtplib

from ..core.settings import settings
from ..logging.logging_config import get_logger

logger = get_logger(__name__)


class EmailSender(Protocol):
    """Minimal seam between `procrastinate_tasks/email_tasks.py` and whatever
    actually transports the message: swapping providers (e.g. SES,
    SendGrid, Postmark) means writing one new class here, not touching the
    Procrastinate task or any of its callers."""

    async def send(self, to_email: str, subject: str, body: str, is_html: bool = True) -> None:
        ...


class SMTPEmailSender:
    """Sends via SMTP with STARTTLS (host/port settings-driven, Gmail by
    default). Raises on failure; the caller (send_email_task) is
    responsible for catching and logging, matching the previous inline
    aiosmtplib.send behavior."""

    async def send(self, to_email: str, subject: str, body: str, is_html: bool = True) -> None:
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
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            start_tls=True,
            username=settings.FROM_EMAIL,
            password=settings.GMAIL_APP_PASSWORD,
        )


class NullEmailSender:
    """Used instead of SMTPEmailSender when settings.EMAIL_ENABLED is False:
    logs what would have been sent (recipient/subject only, never the body -
    it can contain a raw verification/reset token) and returns, without ever
    opening an SMTP connection. For local dev/test runs against a real
    provider (e.g. a personal Gmail account with a real daily send quota),
    where every signup/password-reset/account-deletion flow would otherwise
    burn a real send."""

    async def send(self, to_email: str, subject: str, body: str, is_html: bool = True) -> None:
        logger.info("EMAIL_ENABLED=false, not sending: to=%s subject=%r", to_email, subject)


email_sender: EmailSender = SMTPEmailSender() if settings.EMAIL_ENABLED else NullEmailSender()
