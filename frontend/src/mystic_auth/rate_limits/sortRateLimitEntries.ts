import type { SortState } from "../ui/hooks/useSortState";
import type { RateLimitEntry } from "../api/rate_limits_api";

// Column key -> value extractor. "requests" sorts by count (not the
// count/limit ratio: limit is the same constant for every row today, see
// rate_limiter_service.MAX_REQUESTS_PER_WINDOW, so they'd order identically
// anyway). "resets_at" sorts by resets_in_seconds, with null (no expiry -
// see rate_limiter_service.list_active_limits) sorted after every entry
// that does expire, both ascending and descending, since "never" isn't
// meaningfully "smaller" or "larger" than an actual TTL.
const SORT_VALUE: Record<string, (e: RateLimitEntry) => string | number> = {
    endpoint: (e) => e.endpoint,
    scope: (e) => e.scope,
    identifier: (e) => e.identifier,
    requests: (e) => e.count,
    resets_at: (e) => e.resets_in_seconds ?? Number.POSITIVE_INFINITY,
};

/** Client-side sort over whatever page(s) of the Redis SCAN cursor have
 * been loaded so far - see RateLimitsPage.tsx's docstring for why this
 * can't be a server-side sort of the full keyspace. */
export function sortRateLimitEntries(entries: RateLimitEntry[], sort: SortState): RateLimitEntry[] {
    const getValue = SORT_VALUE[sort.key];
    if (!getValue) return entries;

    const direction = sort.direction === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
        const va = getValue(a);
        const vb = getValue(b);
        if (va < vb) return -1 * direction;
        if (va > vb) return 1 * direction;
        return 0;
    });
}
