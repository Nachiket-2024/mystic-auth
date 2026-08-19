import inspect
import traceback
from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from ...core.settings import settings
from ...logging.logging_config import get_logger
from ...redis.client import redis_client
from .client_ip import get_client_ip

logger = get_logger(__name__)


class RateLimiterService:
    """Enforces a max-requests-per-window rate limit, backed by Redis."""

    MAX_REQUESTS_PER_WINDOW: int = settings.MAX_REQUESTS_PER_WINDOW
    REQUEST_WINDOW_SECONDS: int = settings.REQUEST_WINDOW_SECONDS

    @staticmethod
    async def record_request(key: str) -> bool:
        try:
            # INCR creates the key at 0 before incrementing if it doesn't
            # already exist, and is atomic: unlike a separate GET-then-SET,
            # this can't let two concurrent requests both read the same
            # pre-increment count and both be admitted past the limit.
            new_count = await redis_client.incr(key)

            if new_count == 1:
                await redis_client.expire(key, RateLimiterService.REQUEST_WINDOW_SECONDS)

            return new_count <= RateLimiterService.MAX_REQUESTS_PER_WINDOW

        except Exception:
            logger.error("Error recording rate-limited request:\n%s", traceback.format_exc())
            return False

    @staticmethod
    def _effective_limit(endpoint_name: str, key_scope: str) -> int:
        """The real threshold behind one listed counter. Every counter this
        class itself writes (record_request) shares one limit,
        MAX_REQUESTS_PER_WINDOW - but list_active_limits also surfaces
        login_protection_service's login_lock:{email|ip}:* counters (see its
        own docstring), which enforce two different, unrelated thresholds."""
        if endpoint_name == "login_lock":
            return (
                settings.MAX_FAILED_LOGIN_ATTEMPTS_PER_IP
                if key_scope == "ip"
                else settings.MAX_FAILED_LOGIN_ATTEMPTS
            )
        return RateLimiterService.MAX_REQUESTS_PER_WINDOW

    @staticmethod
    async def reset_counter(key: str) -> None:
        # The same Redis instance also holds unrelated security-critical
        # keys (revoked:{jti} token-revocation entries, password_reset/
        # verify/account_delete tokens, oauth_state, authz policy cache,
        # ...). Without this check, DELETE /rate-limits/{key} would let
        # anyone holding only rate_limits:read delete e.g. a
        # revoked:{jti} entry and un-revoke an already-revoked token, by
        # just passing it as the path param - so only ever delete a key
        # that actually looks like one of ours (matches list_active_limits'
        # own <endpoint>:<ip|account|email>:<identifier> parsing - "email" is
        # login_protection_service's login_lock:email:{email} counter, the
        # actual per-account login-brute-force lockout, which is the whole
        # reason an admin resets a key here: unlocking a legitimate user who
        # tripped it).
        parts = key.rsplit(":", 2)
        if len(parts) != 3 or parts[1] not in ("ip", "account", "email"):
            return

        try:
            await redis_client.delete(key)

        except Exception:
            logger.error("Error resetting rate limiter counter:\n%s", traceback.format_exc())

    # Upper bound on how many matching keys one list_active_limits call will
    # walk to compute a total/page. Keeps the dashboard on real numbered
    # pages (like every other admin table) while still bounding the cost of
    # a SCAN walk in the same pathological case the old cursor-only design
    # was built to avoid: at real production traffic the live keyspace of
    # per-IP/per-account counters can run into the tens of thousands of
    # keys, and this is an admin-only, low-QPS page, not the hot path (see
    # the record_request docstring note below) - so a capped walk on read is
    # an acceptable trade a secondary index on every write would not be.
    MAX_SCANNED_KEYS: int = 5000
    _SCAN_BATCH: int = 500

    @staticmethod
    async def list_active_limits(
        page: int = 1,
        page_size: int = 25,
        scope: str | None = None,
        endpoint: str | None = None,
        identifier: str | None = None,
    ) -> tuple[list[dict[str, Any]], int, bool]:
        """
        Powers the admin Rate Limit Dashboard. `scope`/`endpoint`/
        `identifier` filter via the `MATCH` pattern itself (Redis-side), not
        a Python filter after fetching everything, so a narrowed query is
        cheaper, not just smaller. `identifier` (an IP or account/email) is
        matched as a substring within its key segment, same glob-`MATCH`
        mechanism as the other two, just anchored with `*` on both sides
        instead of exact.

        Walks the matching keyspace with repeated bounded `SCAN` batches
        (never `KEYS`, which blocks the whole Redis instance for however
        long a full keyspace walk takes) up to MAX_SCANNED_KEYS, sorts the
        collected key names for a stable order across separate requests
        (a fresh SCAN's internal cursor order isn't guaranteed to repeat),
        and slices out just the requested page. Only that page's keys are
        then read (GET + TTL), so the per-request Redis round-trip cost
        stays proportional to page_size, not MAX_SCANNED_KEYS.

        Deliberately doesn't touch record_request's hot path (called on
        every single rate-limited request) to maintain some secondary
        index for this: that would add a Redis write to every login/
        signup/refresh call just to make a rarely-viewed admin page
        faster, the wrong trade for a security-critical path.

        Returns (entries, total, truncated). `truncated` means the walk hit
        MAX_SCANNED_KEYS before exhausting the keyspace, so `total` (and
        the page count derived from it) is a floor, not an exact count -
        the caller should prompt narrowing the filters rather than trust it
        as exact.
        """
        scope_segment = scope if scope in ("ip", "account", "email") else "*"
        identifier_segment = f"*{identifier}*" if identifier else "*"
        pattern = f"{endpoint or '*'}:{scope_segment}:{identifier_segment}"

        matched_keys: list[str] = []
        truncated = False
        cursor = 0
        try:
            while True:
                cursor, batch = await redis_client.scan(cursor=cursor, match=pattern, count=RateLimiterService._SCAN_BATCH)
                # redis_client is constructed with decode_responses=True (see
                # redis/client.py), so this is always str at runtime; the
                # cast is only to satisfy the client library's
                # bytes-by-default stubs (same reasoning as the parts =
                # str(key).rsplit(...) cast further down).
                matched_keys.extend(str(key) for key in batch)
                if len(matched_keys) >= RateLimiterService.MAX_SCANNED_KEYS:
                    matched_keys = matched_keys[:RateLimiterService.MAX_SCANNED_KEYS]
                    truncated = True
                    break
                if cursor == 0:
                    break
        except Exception:
            logger.error("Error scanning rate limiter keys:\n%s", traceback.format_exc())
            return [], 0, False

        matched_keys.sort()
        total = len(matched_keys)

        offset = max(0, page - 1) * page_size
        page_keys = matched_keys[offset:offset + page_size]

        if not page_keys:
            return [], total, truncated

        async with redis_client.pipeline(transaction=False) as pipe:
            for key in page_keys:
                pipe.get(key)
                pipe.ttl(key)
            results = await pipe.execute()

        entries: list[dict[str, Any]] = []
        for i, key in enumerate(page_keys):
            count_raw, ttl = results[2 * i], results[2 * i + 1]
            # redis_client is constructed with decode_responses=True (see
            # redis/client.py), so this is always str at runtime; the cast
            # is only to satisfy the client library's bytes-by-default stubs.
            parts = str(key).rsplit(":", 2)
            if len(parts) != 3 or parts[1] not in ("ip", "account", "email"):
                # Shouldn't happen given the MATCH pattern above, but a key
                # that doesn't parse cleanly is skipped rather than shown
                # with garbage endpoint/identifier fields.
                continue
            endpoint_name, key_scope, identifier = parts
            entries.append({
                "key": key,
                "endpoint": endpoint_name,
                "scope": key_scope,
                "identifier": identifier,
                "count": int(count_raw) if count_raw is not None else 0,
                # login_protection_service.py's login_lock:{email|ip}:*
                # counters aren't rate_limiter_service's own - they're a
                # failed-attempt lockout with their own, different
                # thresholds, not RateLimiterService.MAX_REQUESTS_PER_WINDOW.
                "limit": RateLimiterService._effective_limit(endpoint_name, key_scope),
                "resets_in_seconds": ttl if ttl is not None and ttl >= 0 else None,
            })

        return entries, total, truncated

    def rate_limited(
        self,
        endpoint_name: str,
        account_key_func: Callable[[dict], str | None | Awaitable[str | None]] | None = None,
    ) -> Callable[[Callable[..., Awaitable[Any]]], Callable[..., Awaitable[Any]]]:
        """
        account_key_func, if given, extracts an account identifier (e.g. email)
        from the endpoint's resolved keyword arguments, since FastAPI always calls the
        wrapped endpoint with its dependencies as kwargs, so this can pull
        straight from the parsed request body/params (e.g.
        `lambda kwargs: kwargs["payload"].email`). May be sync or async (the
        wrapper below awaits the result iff it's awaitable) - a token-only
        route (e.g. get_current_user, logout) has no such field to read
        synchronously, only an encoded access_token cookie, so its
        account_key_func decodes that instead (see
        auth_routes.py's `_access_token_account_key`, backed by
        jwt_service.decode_payload - real signature+expiry verification, just
        skipping the revocation lookup verify_token also does, so this stays
        a local CPU-bound decode with no extra Redis round trip). Pass None
        for endpoints with no account identifier available by either means.
        When supplied, it adds a per-account limit, keyed independently of
        IP: this closes the gap where an attacker spreads requests targeting
        one account across many source IPs specifically to stay under the
        per-IP threshold, which a per-IP-only limiter would never flag as
        abuse.
        """
        def decorator(func: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
            @wraps(func)
            async def wrapper(*args: Any, **kwargs: Any) -> Any:
                request: Request | None = None

                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

                if not request:
                    request = kwargs.get("request")

                ip_address = (get_client_ip(request) if request else None) or "unknown"

                ip_key = f"{endpoint_name}:ip:{ip_address}"

                allowed = await self.record_request(ip_key)

                if not allowed:
                    return JSONResponse(
                        content={
                            "error": f"Too many {endpoint_name} attempts",
                            "code": "TOO_MANY_ATTEMPTS",
                            "params": {"endpoint": endpoint_name},
                        },
                        status_code=429
                    )

                if account_key_func is not None:
                    try:
                        account_value = account_key_func(kwargs)
                        if inspect.isawaitable(account_value):
                            account_value = await account_value
                    except Exception:
                        # Extraction failing (missing/malformed field) shouldn't
                        # break the request, just skip the account-level check.
                        # Logged because a silent skip here means per-account
                        # brute-force protection quietly stops applying.
                        logger.warning(
                            "account_key_func failed for endpoint '%s'; "
                            "per-account rate limiting skipped for this request:\n%s",
                            endpoint_name,
                            traceback.format_exc(),
                        )
                        account_value = None

                    if account_value:
                        account_key = f"{endpoint_name}:account:{account_value}"
                        account_allowed = await self.record_request(account_key)

                        if not account_allowed:
                            return JSONResponse(
                                content={
                                    "error": f"Too many {endpoint_name} attempts",
                                    "code": "TOO_MANY_ATTEMPTS",
                                    "params": {"endpoint": endpoint_name},
                                },
                                status_code=429
                            )

                return await func(*args, **kwargs)

            return wrapper

        return decorator


rate_limiter_service = RateLimiterService()
