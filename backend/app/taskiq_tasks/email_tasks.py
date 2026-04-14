# ---------------------------- External Imports ----------------------------
# Async email sending library
import aiosmtplib

# Email message class for constructing emails
from email.message import EmailMessage

# Capture full stack traces for debugging exceptions
import traceback

# Base broker interface for Taskiq async tasks
from taskiq import AsyncBroker

# Redis-based broker and async result backend for Taskiq
from taskiq_redis import RedisStreamBroker, RedisAsyncResultBackend

# ---------------------------- Internal Imports ----------------------------
# Load settings like email credentials and App Password
from ..core.settings import settings

# Import centralized logger factory to create structured, module-specific loggers
from ..logging.logging_config import get_logger

# ---------------------------- Logger Setup ----------------------------
# Create a logger instance for this module
logger = get_logger(__name__)

# ---------------------------- Taskiq Broker Setup ----------------------------
# Create Redis async result backend to store and retrieve task results
result_backend = RedisAsyncResultBackend(redis_url=settings.REDIS_URL)

# Create a Redis-backed Taskiq broker with result backend for async task handling
broker: AsyncBroker = RedisStreamBroker(
    url=settings.REDIS_URL,
).with_result_backend(result_backend)

# ---------------------------- Async Email Sending Task ----------------------------
@broker.task
async def send_email_task(to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
    """
    Input:
        1. to_email (str): Recipient email address.
        2. subject (str): Email subject line.
        3. body (str): Email content/body (HTML or plain text).
        4. is_html (bool): True if body is HTML, False for plain text. Defaults to True.

    Process:
        1. Create a new EmailMessage instance.
        2. Set the From, To, and Subject headers.
        3. Set the body/content of the email with appropriate content type.
        4. Connect to Gmail SMTP server using the App Password and send the email.
        5. Return True if email sent successfully, otherwise False.

    Output:
        1. bool: True if email sent successfully, False otherwise.
    """
    try:
        # Step 1: Create a new EmailMessage instance
        message = EmailMessage()

        # Step 2: Set the From, To, and Subject headers
        message["From"] = settings.FROM_EMAIL
        message["To"] = to_email
        message["Subject"] = subject

        # Step 3: Set the body/content of the email with appropriate content type
        if is_html:
            # Set HTML content type for professional email formatting
            message.set_content(body, subtype="html")
        else:
            # Set plain text content type for simple emails
            message.set_content(body)

        # Step 4: Connect to Gmail SMTP server using the App Password and send the email
        # Note: GMAIL_APP_PASSWORD is stored securely in settings (from .env)
        await aiosmtplib.send(
            message,
            hostname="smtp.gmail.com",
            port=587,
            start_tls=True,
            username=settings.FROM_EMAIL,
            password=settings.GMAIL_APP_PASSWORD  # App Password for SMTP login
        )

        # Step 5: Return True if email sent successfully, otherwise False
        logger.info("Email sent successfully to %s", to_email)
        return True

    except Exception:
        # Log the full exception traceback for better debugging
        logger.error("Error sending email to %s:\n%s", to_email, traceback.format_exc())
        return False