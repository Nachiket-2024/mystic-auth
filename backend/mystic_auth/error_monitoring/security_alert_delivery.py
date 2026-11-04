"""Delivery of security alerts to the configured webhook (ntfy or generic JSON).

Kept apart from sentry_service.py so the background job that retries a failed
delivery can import it without pulling in the request-handling modules.
Alerts are metadata only; nothing here ever sees a token or a password.
"""

import hashlib
import json
import logging
from collections.abc import Mapping
from urllib.parse import urlsplit

import httpx

from ..core.settings import settings
from ..logging.logging_config import get_startup_logger
from ..valkey.client import valkey_client

startup_logger = get_startup_logger(__name__)

# httpx logs every request URL at INFO. For an ntfy webhook the URL contains the
# topic name, which is the secret that protects the alerts, so keep it out of logs.
logging.getLogger("httpx").setLevel(logging.WARNING)

# Per event type: at most this many alerts per minute leave the app. A burst
# (for example a lockout storm) becomes a handful of messages, not a flood.
ALERT_MAX_PER_MINUTE = 10
_ALERT_WINDOW_SECONDS = 60
# Identical alerts inside this window are sent once.
_ALERT_DEDUPE_SECONDS = 60

# Domains reserved for documentation and tests: an alert sent there is lost.
_PLACEHOLDER_SUFFIXES = (".example", ".example.com", ".example.org", ".example.net", ".test", ".invalid", ".localhost")
_PLACEHOLDER_HOSTS = {"example.com", "example.org", "example.net", "localhost"}

# Everything else is "high". Rate-limit denials are routine enough to stay quiet.
_LOW_PRIORITY_EVENTS = {"rate_limit_exceeded"}


def webhook_is_placeholder(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return host in _PLACEHOLDER_HOSTS or host.endswith(_PLACEHOLDER_SUFFIXES)


def warn_if_alert_destination_unusable() -> None:
    """One clear boot-time line instead of a failure on every alert."""
    url = settings.SECURITY_ALERT_WEBHOOK_URL
    if not url:
        startup_logger.warning(
            "SECURITY_ALERT_WEBHOOK_URL is not set: security alerts go only to the audit log and error monitoring."
        )
    elif webhook_is_placeholder(url):
        startup_logger.warning(
            "SECURITY_ALERT_WEBHOOK_URL points at a placeholder host (%s): alerts will not be delivered.",
            urlsplit(url).hostname,
        )


def build_request(event_type: str, payload: Mapping[str, object]) -> tuple[dict[str, str], dict[str, object]]:
    """Headers and httpx kwargs for the configured format."""
    headers: dict[str, str] = {}
    if settings.SECURITY_ALERT_WEBHOOK_TOKEN:
        headers["authorization"] = f"Bearer {settings.SECURITY_ALERT_WEBHOOK_TOKEN}"

    if settings.SECURITY_ALERT_WEBHOOK_FORMAT == "ntfy":
        metadata = payload.get("metadata") or {}
        lines = [f"environment: {payload.get('environment')}", f"time: {payload.get('occurred_at')}"]
        lines += [f"{key}: {value}" for key, value in dict(metadata).items()]  # type: ignore[call-overload]
        headers["title"] = f"{settings.APP_NAME}: {event_type}"
        headers["priority"] = "default" if event_type in _LOW_PRIORITY_EVENTS else "high"
        headers["tags"] = "rotating_light"
        return headers, {"content": "\n".join(lines).encode("utf-8")}

    headers["content-type"] = "application/json"
    return headers, {"json": payload}


async def send_alert(event_type: str, payload: Mapping[str, object]) -> None:
    """POST one alert. Raises on any failure so a caller can retry."""
    headers, body = build_request(event_type, payload)
    async with httpx.AsyncClient(timeout=settings.SECURITY_ALERT_WEBHOOK_TIMEOUT_SECONDS) as client:
        response = await client.post(settings.SECURITY_ALERT_WEBHOOK_URL, headers=headers, **body)  # type: ignore[arg-type]
        response.raise_for_status()


async def should_send(event_type: str, metadata: Mapping[str, object] | None) -> bool:
    """Throttle: drop an identical alert seen in the last minute and anything
    past ALERT_MAX_PER_MINUTE for one event type. Fails open: if Valkey is
    down the alert is sent, because a missed alert is worse than a repeat."""
    try:
        digest = hashlib.sha256(json.dumps(dict(metadata or {}), sort_keys=True, default=str).encode()).hexdigest()
        if not await valkey_client.set(f"alert_dedupe:{event_type}:{digest}", "1", ex=_ALERT_DEDUPE_SECONDS, nx=True):
            return False
        count = await valkey_client.incr(f"alert_rate:{event_type}")
        if count == 1:
            await valkey_client.expire(f"alert_rate:{event_type}", _ALERT_WINDOW_SECONDS)
        if count == ALERT_MAX_PER_MINUTE + 1:
            startup_logger.warning(
                "Security alert '%s' is being throttled (more than %s per minute); see the audit log for every event.",
                event_type, ALERT_MAX_PER_MINUTE,
            )
        return count <= ALERT_MAX_PER_MINUTE
    except Exception:
        return True
