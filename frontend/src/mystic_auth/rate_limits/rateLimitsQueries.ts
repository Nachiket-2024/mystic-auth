import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { listRateLimitsApi } from "../api/rate_limits_api";

export const RATE_LIMITS_QUERY_KEY = ["rate-limits"] as const;

export interface RateLimitsFilters {
    scope?: "ip" | "account" | "email";
    endpoint?: string;
    identifier?: string;
}

// Matches rate_limiter_service.py's own _SCAN_SNAPSHOT_TTL_SECONDS: polling
// any faster wouldn't show anything new (the backend serves the same cached
// SCAN snapshot within that window anyway), and polling this page is exactly
// what that snapshot cache exists to make cheap.
const POLL_INTERVAL_MS = 5000;

/**
 * Numbered-page pagination, same shape as the audit log's queries: the
 * backend walks the matching Redis keyspace (bounded, see rate_limiter_
 * service.py's list_active_limits) to compute a real total and slice out
 * one page, rather than the old Prev/Next-only cursor shape.
 *
 * keepPreviousData: without it, switching pages briefly flashes the
 * loading skeleton over an otherwise-unchanged table (filters/columns are
 * identical - only the page's rows differ), which reads as a bigger UI
 * change than moving one page actually is. The same option keeps a poll's
 * background refetch silent for the same reason - counters update in place
 * instead of the whole table flashing back to a loading state every 5s.
 *
 * refetchIntervalInBackground: false (the default) - polling pauses while
 * the tab isn't visible, so nothing is wasted counting requests nobody is
 * looking at, and resumes (with an immediate refetch) the moment the tab
 * regains focus.
 */
export function useRateLimitsQuery(page: number, pageSize: number, filters: RateLimitsFilters = {}) {
    return useQuery({
        queryKey: [...RATE_LIMITS_QUERY_KEY, page, pageSize, filters],
        queryFn: async () => {
            const res = await listRateLimitsApi({ page, pageSize, ...filters });
            return res.data;
        },
        placeholderData: keepPreviousData,
        refetchInterval: POLL_INTERVAL_MS,
    });
}
