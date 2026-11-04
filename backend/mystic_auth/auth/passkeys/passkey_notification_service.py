import html
import logging

from ...core.settings import settings
from ...emails.email_template_service import render_transactional_email
from ...procrastinate_tasks.email_tasks import send_email_task

logger = logging.getLogger(__name__)

# A passkey is a sign-in method that survives password resets, so the owner is
# emailed whenever one is added or removed. If an attacker adds one to a hijacked
# account, this is how the real owner finds out.
_ACCENT_COLOR = "#c53030"


async def notify_passkey_added(email: str, passkey_name: str) -> None:
    await _send(
        email,
        subject="A passkey was added to your account",
        heading="Passkey Added",
        intro=(
            f"A new passkey named <strong>{html.escape(passkey_name)}</strong> was added to your "
            f"{html.escape(settings.APP_NAME)} account. It can now be used to sign in."
        ),
    )


async def notify_passkeys_removed(email: str, count: int) -> None:
    noun = "passkey was" if count == 1 else "passkeys were"
    await _send(
        email,
        subject="A passkey was removed from your account",
        heading="Passkey Removed",
        intro=f"{count} {noun} removed from your {html.escape(settings.APP_NAME)} account.",
    )


async def notify_passkeys_removed_by_operator(email: str, count: int) -> None:
    noun = "passkey was" if count == 1 else "passkeys were"
    await _send(
        email,
        subject="Passkeys were removed from your account by an authorized operator",
        heading="Passkeys Removed by an Authorized Operator",
        intro=(
            f"{count} {noun} removed from your {html.escape(settings.APP_NAME)} account by an "
            "authorized operator, usually as part of a security review. You can still sign in with your "
            "password or Google, and you can add a new passkey from your account settings."
        ),
    )


async def _send(email: str, *, subject: str, heading: str, intro: str) -> None:
    """Best effort: the passkey change has already happened, so a mail failure
    is logged and never turned into an error for the user."""
    try:
        body = render_transactional_email(
            preheader=subject,
            heading=heading,
            accent_color=_ACCENT_COLOR,
            intro=intro,
            cta_label="Review your passkeys",
            cta_url=f"{settings.FRONTEND_BASE_URL}/account-settings?tab=passkeys",
            expiry_note="This is a security notice and does not expire.",
            ignore_note=(
                "If this was you, no action is needed. If it was not, open your passkey settings, "
                "remove anything you do not recognize, and change your password."
            ),
        )
        await send_email_task.defer_async(to_email=email, subject=subject, body=body, is_html=True)
    except Exception:
        logger.warning("Could not queue passkey change notice for %s", email, exc_info=True)
