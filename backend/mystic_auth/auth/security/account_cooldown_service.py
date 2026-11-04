"""Per-account brute-force brake that does not depend on the source IP.

The login lockout is keyed on account plus source IP, so guessing spread over
many addresses (a botnet, or an IPv6 range) never trips it. This counts failed
logins for one account across every source. Once the count reaches
LOGIN_ACCOUNT_FAILURE_THRESHOLD inside the window, the account only accepts one
attempt per LOGIN_ACCOUNT_COOLDOWN_SECONDS. That is a cool-down, not a lock: an
attacker is held to a couple of guesses a minute, while the real owner can
still sign in after a short wait, so the brake cannot be used to shut the owner
out. Counting is by the submitted email whether or not the account exists, so
the behaviour reveals nothing about which accounts exist.
"""

import traceback

from ...core.errors import service_unavailable_error
from ...core.settings import settings
from ...logging.logging_config import get_logger
from ...valkey.client import valkey_client
from ...valkey.key_names import email_key_id

logger = get_logger(__name__)


def _failures_key(email: str) -> str:
    return f"login_account_failures:{email_key_id(email)}"


def _cooldown_key(email: str) -> str:
    return f"login_account_cooldown:{email_key_id(email)}"


async def cooldown_remaining_seconds(email: str) -> int:
    """0 if this attempt may proceed, otherwise seconds until the next one.

    Taking the single attempt slot is part of the check (SET NX), so two
    concurrent attempts cannot both pass."""
    try:
        failures = await valkey_client.get(_failures_key(email))
        if failures is None or int(failures) < settings.LOGIN_ACCOUNT_FAILURE_THRESHOLD:
            return 0
        if await valkey_client.set(
            _cooldown_key(email), "1", ex=settings.LOGIN_ACCOUNT_COOLDOWN_SECONDS, nx=True
        ):
            return 0
        return max(1, await valkey_client.ttl(_cooldown_key(email)))
    except Exception:
        logger.error("Error checking account cool-down:\n%s", traceback.format_exc())
        raise service_unavailable_error() from None


async def record_failure(email: str) -> bool:
    """Count one failed login. True exactly once, when the threshold is crossed."""
    try:
        count = await valkey_client.incr(_failures_key(email))
        if count == 1:
            await valkey_client.expire(_failures_key(email), settings.LOGIN_ACCOUNT_FAILURE_WINDOW_SECONDS)
        return count == settings.LOGIN_ACCOUNT_FAILURE_THRESHOLD
    except Exception:
        logger.error("Error recording account login failure:\n%s", traceback.format_exc())
        return False


async def reset(email: str) -> None:
    """A successful sign-in by the owner clears the count."""
    try:
        await valkey_client.delete(_failures_key(email), _cooldown_key(email))
    except Exception:
        logger.error("Error resetting account login failures:\n%s", traceback.format_exc())
