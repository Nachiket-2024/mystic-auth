import time
import traceback
from typing import Any

from ...core.settings import settings
from ...logging.logging_config import get_logger
from ...redis.client import redis_client
from .rate_limiter_service import RateLimiterService

logger = get_logger(__name__)


class RateLimitDashboardService:
    """Read/admin side of the rate limiter's Redis keyspace, split out of
    RateLimiterService so that class stays focused on the hot path
    (record_request/rate_limited, called on every rate-limited request).
    Backs the admin Rate Limit Dashboard only."""

    @staticmethod
    def _effective_limit(endpoint_name: str, key_scope: str) -> int:
        """The real threshold behind one listed counter. Every counter
        RateLimiterService itself writes (record_request) shares one limit,
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
            return

        # list_active_limits' _scan_snapshot_cache below can still be
        # holding this key from a walk done moments ago (up to
        # _SCAN_SNAPSHOT_TTL_SECONDS old). Without clearing it here, the
        # dashboard's own post-reset refetch (the frontend invalidates its
        # query immediately on a successful reset) would re-serve that same
        # stale snapshot and keep listing the just-deleted key for however
        # long is left on its TTL - the admin resets a counter, the row
        # doesn't disappear, and it looks like the reset didn't work. Clear
        # every cached pattern rather than trying to match which ones this
        # key's endpoint/scope/identifier could satisfy (the scope segment
        # in list_active_limits' pattern is often "*", so several cached
        # patterns could match one key) - this is an admin-only, low-QPS
        # page, so losing the rest of the snapshot cache on every reset
        # isn't a meaningful cost.
        RateLimitDashboardService._scan_snapshot_cache = {}

    # Upper bound on how many matching keys one list_active_limits call will
    # walk to compute a total/page. Keeps the dashboard on real numbered
    # pages (like every other admin table) while still bounding the cost of
    # a SCAN walk in the same pathological case the old cursor-only design
    # was built to avoid: at real production traffic the live keyspace of
    # per-IP/per-account counters can run into the tens of thousands of
    # keys, and this is an admin-only, low-QPS page, not the hot path (see
    # record_request's docstring) - so a capped walk on read is an
    # acceptable trade a secondary index on every write would not be.
    MAX_SCANNED_KEYS: int = 5000
    _SCAN_BATCH: int = 500

    # The dashboard pages through this by issuing one HTTP request per page,
    # each of which used to re-walk the live keyspace from scratch. Because
    # the underlying counters are TTL-bound and constantly expiring/being
    # created, two independent walks moments apart can disagree on which
    # keys exist - e.g. page 1's walk sees a smaller/empty set right as some
    # counters expire, then page 2's walk (run a moment later, as new
    # requests land) sees a larger set and returns rows beyond what page 1's
    # total implied. Caching the matched-key snapshot per filter pattern for
    # a few seconds gives consecutive page requests for the same
    # scope/endpoint/identifier filters a consistent view to slice, without
    # meaningfully staling out an admin-only, low-QPS page.
    _SCAN_SNAPSHOT_TTL_SECONDS: float = 5.0
    _scan_snapshot_cache: dict[str, tuple[float, list[str], bool]] = {}

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

        now = time.monotonic()
        cached = RateLimitDashboardService._scan_snapshot_cache.get(pattern)
        if cached is not None and now - cached[0] < RateLimitDashboardService._SCAN_SNAPSHOT_TTL_SECONDS:
            _, matched_keys, truncated = cached
        else:
            matched_keys = []
            truncated = False
            cursor = 0
            try:
                while True:
                    cursor, batch = await redis_client.scan(
                        cursor=cursor, match=pattern, count=RateLimitDashboardService._SCAN_BATCH
                    )
                    # redis_client is constructed with decode_responses=True (see
                    # redis/client.py), so this is always str at runtime; the
                    # cast is only to satisfy the client library's
                    # bytes-by-default stubs (same reasoning as the parts =
                    # str(key).rsplit(...) cast further down).
                    matched_keys.extend(str(key) for key in batch)
                    if len(matched_keys) >= RateLimitDashboardService.MAX_SCANNED_KEYS:
                        matched_keys = matched_keys[:RateLimitDashboardService.MAX_SCANNED_KEYS]
                        truncated = True
                        break
                    if cursor == 0:
                        break
            except Exception:
                logger.error("Error scanning rate limiter keys:\n%s", traceback.format_exc())
                return [], 0, False

            # The MATCH pattern above only anchors the endpoint/identifier
            # segments - the scope segment stays "*" whenever `scope` isn't
            # given, since Redis glob patterns can't express "one of
            # ip|account|email" in a single pattern. That means the walk
            # also matches any other key in the shared Redis instance that
            # happens to contain two colons, e.g. the authorization cache's
            # authz:user_policies:{email} (see authorization_cache_service.py).
            # Those keys got dropped later when building `entries` (the
            # parts[1] not in (...) check below), but were still counted into
            # `total` here - so a page could land entirely on non-rate-limit
            # keys and render empty even though a later page had real rows.
            # Filtering them out before computing total/slicing keeps every
            # page dense and `total` accurate.
            matched_keys = [
                key for key in matched_keys
                if len(key.rsplit(":", 2)) == 3 and key.rsplit(":", 2)[1] in ("ip", "account", "email")
            ]

            matched_keys.sort()
            # Opportunistically drop expired snapshots so the cache doesn't
            # grow unbounded across distinct filter combinations over time.
            RateLimitDashboardService._scan_snapshot_cache = {
                key: value
                for key, value in RateLimitDashboardService._scan_snapshot_cache.items()
                if now - value[0] < RateLimitDashboardService._SCAN_SNAPSHOT_TTL_SECONDS
            }
            RateLimitDashboardService._scan_snapshot_cache[pattern] = (now, matched_keys, truncated)

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
                "limit": RateLimitDashboardService._effective_limit(endpoint_name, key_scope),
                "resets_in_seconds": ttl if ttl is not None and ttl >= 0 else None,
            })

        return entries, total, truncated


rate_limit_dashboard_service = RateLimitDashboardService()
