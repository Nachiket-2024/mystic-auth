"""Per-user and per-IP connection leases for the session-event SSE stream.

A lease is a short-lived slot in Valkey. It caps how many live streams one account
or one client IP can hold, and it expires on its own if a worker dies before it
can release the slot. session_events.py keeps the pub/sub side and the
stream loop.
"""
import hashlib
import time
import traceback
from uuid import uuid4

from ..core.settings import settings
from ..logging.logging_config import get_logger
from ..valkey.client import valkey_client

logger = get_logger(__name__)

# A lease is only valid for a few heartbeats and is renewed while the stream is
# alive. A clean close releases it at once (see session_event_stream's finally);
# an abrupt one (closed laptop lid, killed worker) frees the slot within about a
# minute instead of holding it for the whole connection lifetime.
_LEASE_SECONDS = 3 * 20
_LEASE_TTL_SECONDS = _LEASE_SECONDS + settings.SESSION_EVENT_LEASE_GRACE_SECONDS
_LEASE_KEY_PREFIX = "session_event_leases"

# Sorted sets allow expired leases to be removed atomically before admission.
# The Lua script makes cleanup, capacity checks, and both inserts one atomic
# Valkey operation across every API worker in a multi-process deployment.
_ACQUIRE_LEASE_SCRIPT = """
local now = tonumber(ARGV[1])
local expires = tonumber(ARGV[2])
local account_limit = tonumber(ARGV[3])
local ip_limit = tonumber(ARGV[4])
local token = ARGV[5]
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= account_limit then return 0 end
if redis.call('ZCARD', KEYS[2]) >= ip_limit then return 0 end
redis.call('ZADD', KEYS[1], expires, token)
redis.call('ZADD', KEYS[2], expires, token)
redis.call('EXPIRE', KEYS[1], ARGV[6])
redis.call('EXPIRE', KEYS[2], ARGV[6])
return 1
"""

_REFRESH_LEASE_SCRIPT = """
redis.call('ZADD', KEYS[1], 'XX', ARGV[2], ARGV[1])
redis.call('ZADD', KEYS[2], 'XX', ARGV[2], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1
"""

_RELEASE_LEASE_SCRIPT = """
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
if redis.call('ZCARD', KEYS[1]) == 0 then redis.call('DEL', KEYS[1]) end
if redis.call('ZCARD', KEYS[2]) == 0 then redis.call('DEL', KEYS[2]) end
return 1
"""


def _lease_key(scope: str, value: str) -> str:
    """Hash identifiers before storing them as inspectable Valkey keys."""
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return f"{_LEASE_KEY_PREFIX}:{scope}:{digest}"


async def acquire_session_event_lease(email: str, client_ip: str) -> str | None:
    """Reserve one globally-counted SSE slot or fail closed.

    The live-update stream is optional. If Valkey is unavailable, rejecting
    this channel avoids accepting unbounded long-lived sockets while normal
    authenticated API requests continue to use their existing failure policy.
    """
    token = uuid4().hex
    now = int(time.time())
    expires = now + _LEASE_SECONDS
    try:
        admitted = await valkey_client.eval(
            _ACQUIRE_LEASE_SCRIPT,
            2,
            _lease_key("account", email),
            _lease_key("ip", client_ip),
            now,
            expires,
            settings.SESSION_EVENT_MAX_CONNECTIONS_PER_ACCOUNT,
            settings.SESSION_EVENT_MAX_CONNECTIONS_PER_IP,
            token,
            _LEASE_TTL_SECONDS,
        )
    except Exception:
        logger.error("Unable to reserve session-event connection capacity:\n%s", traceback.format_exc())
        return None

    return token if int(admitted) == 1 else None


async def refresh_session_event_lease(email: str, client_ip: str, token: str) -> None:
    """Push this stream's lease expiry forward. Best effort: if it fails the
    lease simply expires early and the next heartbeat tries again."""
    try:
        await valkey_client.eval(
            _REFRESH_LEASE_SCRIPT,
            2,
            _lease_key("account", email),
            _lease_key("ip", client_ip),
            token,
            int(time.time()) + _LEASE_SECONDS,
            _LEASE_TTL_SECONDS,
        )
    except Exception:
        logger.warning("Unable to renew session-event connection lease:\n%s", traceback.format_exc())


async def release_session_event_lease(email: str, client_ip: str, token: str) -> None:
    """Release only this stream's lease; expiry remains the crash recovery path."""
    try:
        await valkey_client.eval(
            _RELEASE_LEASE_SCRIPT,
            2,
            _lease_key("account", email),
            _lease_key("ip", client_ip),
            token,
        )
    except Exception:
        logger.warning("Unable to release session-event connection lease:\n%s", traceback.format_exc())
