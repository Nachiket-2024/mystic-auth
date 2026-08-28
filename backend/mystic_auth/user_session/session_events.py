import asyncio
import json
import traceback
from collections.abc import AsyncIterator

from ..logging.logging_config import get_logger
from ..redis.client import redis_client

logger = get_logger(__name__)

_CHANNEL_TEMPLATE = "session_events:{email}"

# How often the stream sends a keep-alive comment when no real event has
# arrived, so intermediate proxies/load balancers (and the browser's own
# idle-connection timeout) don't treat a quiet-but-healthy connection as
# dead and close it.
_HEARTBEAT_SECONDS = 20

# Upper bound on how long one SSE connection stays open. Past this, the
# generator returns and the response ends normally; EventSource treats that
# like a dropped connection and reconnects on its own. Bounds how long a
# stuck client can hold a Redis pubsub connection open, and gives a
# connection that misses the shutdown signal a ceiling too. Long enough
# that reconnects are rare, short enough to never block a deploy's
# shutdown timeout.
_MAX_CONNECTION_SECONDS = 15 * 60

# Set from main.py's lifespan shutdown, right before it disposes the DB pool
# and closes redis_client. Lets every open session_event_stream() loop
# notice immediately and return, instead of the ASGI server waiting on the
# next heartbeat or _MAX_CONNECTION_SECONDS. See session_event_stream's
# docstring for why polling request.is_disconnected() doesn't work here.
_shutdown_event = asyncio.Event()


def signal_shutdown() -> None:
    """Called once from main.py's lifespan teardown. Wakes every currently
    open session_event_stream() loop so it exits immediately instead of the
    process hanging past its graceful-shutdown timeout waiting for
    long-lived SSE connections to drain on their own."""
    _shutdown_event.set()


async def publish_session_revoked(email: str) -> None:
    """
    Real-time nudge: tells every open tab/device currently holding a live
    GET /auth/session-events connection for this account to re-check its
    own session right now (a normal GET /auth/me / GET /auth/sessions
    refetch), instead of waiting for its next background poll or window-
    focus refetch. Best-effort and never raises: a Redis hiccup here must
    never turn a successful revoke into a failed request, the same
    reasoning as every other best-effort side-channel in this codebase
    (audit logging, the Manage Sessions mirror).

    Deliberately just a "something changed, go check" signal, not "you are
    logged out": the receiving tab might be a completely different,
    unaffected session (see refresh_token_service.revoke_chain_for_user),
    so the actual authoritative answer still comes from the normal
    request/response auth checks, never from this event's payload.
    """
    try:
        await redis_client.publish(_CHANNEL_TEMPLATE.format(email=email), json.dumps({"type": "revoked"}))
    except Exception:
        logger.warning("Failed to publish session-revoked event for %s:\n%s", email, traceback.format_exc())


async def publish_session_created(email: str) -> None:
    """
    Same real-time nudge as publish_session_revoked, fired the moment a new
    login (password or OAuth2) creates a session row instead of one ending.
    Without this, a tab already open on Dashboard/Account Settings/Manage
    Sessions would only learn about a fresh login on another device via its
    own background poll (useCurrentUserQuery/useSessionsQuery's
    refetchInterval) or a window-focus refetch - "Active sessions" and
    "Manage Sessions" could sit stale for up to that interval after a login
    elsewhere, unlike a revoke, which already gets this treatment.
    """
    try:
        await redis_client.publish(_CHANNEL_TEMPLATE.format(email=email), json.dumps({"type": "created"}))
    except Exception:
        logger.warning("Failed to publish session-created event for %s:\n%s", email, traceback.format_exc())


async def publish_permissions_changed(email: str) -> None:
    """
    Same real-time nudge as publish_session_revoked, fired the moment an
    admin grants or revokes one of this account's policies (see
    policy_assignment_routes.py). Without this, a tab this account already
    has open - e.g. sat on the Rate Limit Dashboard, which is gated on
    rate_limits:read - would keep rendering with its now-stale cached
    permissions (useCurrentUserQuery's own 2-minute refetchInterval) until
    that poll, a window-focus refetch, or a manual reload: exactly the
    "revoked access still visibly usable for a while" gap this exists to
    close. Deliberately reuses the same session_events channel/frontend
    handler as revoke/created (useSessionEventsStream already invalidates
    CURRENT_USER_QUERY_KEY on any message) rather than adding a second
    stream - the receiving tab still re-derives everything from a normal
    GET /auth/me, this is only the "something changed, go check" signal.
    """
    try:
        await redis_client.publish(_CHANNEL_TEMPLATE.format(email=email), json.dumps({"type": "permissions_changed"}))
    except Exception:
        logger.warning("Failed to publish permissions-changed event for %s:\n%s", email, traceback.format_exc())


async def session_event_stream(email: str) -> AsyncIterator[str]:
    """
    Yields Server-Sent-Events-formatted lines on `email`'s own channel
    until the client disconnects. One Redis Pub/Sub subscription per open
    tab: fine at this app's scale (a handful of users, not millions
    of concurrent connections); a larger deployment would front this with
    a proper pub/sub fan-out layer instead of one subscription per
    connection.

    Deliberately does NOT poll request.is_disconnected() to end the loop
    early: this app's LoggingMiddleware (see logging/logging_middleware.py)
    is a BaseHTTPMiddleware, and Starlette's BaseHTTPMiddleware is documented
    to make is_disconnected() unreliable for a downstream streaming endpoint
    - it was observed returning True on the very first check even with a
    live client, closing this stream within milliseconds of opening it. The
    browser's EventSource then auto-reconnected in a tight loop, and any
    publish_permissions_changed()/publish_session_revoked() fired during one
    of the resulting gaps was silently lost (Redis pub/sub doesn't replay to
    a subscriber that wasn't connected at publish time) - exactly the "stays
    on a just-revoked page until a manual refresh" bug this stream exists to
    prevent. A real disconnect is still caught without this check: the next
    `yield` after the socket closes fails to send, which surfaces here as
    asyncio.CancelledError (handled below) or propagates out to the finally
    block either way.

    Bounded instead by _MAX_CONNECTION_SECONDS (a periodic clean cutoff the
    client's EventSource just reconnects from) and _shutdown_event (an
    immediate clean stop on SIGTERM/reload) - see both module-level comments
    above. Neither closes the stream the way the old is_disconnected() bug
    did: that was closing within milliseconds of opening, over and over,
    with the client racing to reconnect the whole time. These fire at most
    once per _MAX_CONNECTION_SECONDS, or once, ever, per process shutdown -
    ordinary long-lived connections are unaffected in between.
    """
    channel = _CHANNEL_TEMPLATE.format(email=email)
    pubsub = redis_client.pubsub()
    loop = asyncio.get_running_loop()
    deadline = loop.time() + _MAX_CONNECTION_SECONDS
    try:
        await pubsub.subscribe(channel)

        while True:
            # Non-blocking drain first, before honoring shutdown/cutoff:
            # Redis can push a message into the local buffer before a
            # shutdown is noticed, and ending the stream without draining it
            # would silently lose an event that already arrived.
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0)
            if message is not None:
                yield f"data: {message['data']}\n\n"
                continue

            if _shutdown_event.is_set():
                return

            remaining = deadline - loop.time()
            if remaining <= 0:
                return

            get_message_task = asyncio.ensure_future(
                pubsub.get_message(ignore_subscribe_messages=True, timeout=min(_HEARTBEAT_SECONDS, remaining))
            )
            shutdown_task = asyncio.ensure_future(_shutdown_event.wait())
            try:
                done, pending = await asyncio.wait(
                    {get_message_task, shutdown_task}, return_when=asyncio.FIRST_COMPLETED
                )
            except asyncio.CancelledError:
                get_message_task.cancel()
                shutdown_task.cancel()
                raise
            for task in pending:
                task.cancel()

            if shutdown_task in done:
                return

            message = get_message_task.result()

            if message is None:
                # Nothing arrived within the heartbeat window: a comment
                # line (SSE ignores lines starting with ":"), not a real
                # event, purely to keep the connection alive.
                yield ": heartbeat\n\n"
                continue

            yield f"data: {message['data']}\n\n"

    except asyncio.CancelledError:
        raise
    except Exception:
        logger.warning("Session event stream for %s ended unexpectedly:\n%s", email, traceback.format_exc())
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
