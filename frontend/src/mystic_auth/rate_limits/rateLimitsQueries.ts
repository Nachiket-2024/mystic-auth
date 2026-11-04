import { useQuery } from "@tanstack/react-query";

import { listRateLimitsApi } from "../api/rate_limits_api";

export const RATE_LIMITS_QUERY_KEY = ["rate-limits"] as const;

export interface RateLimitsFilters {
    scope?: "ip" | "account" | "email" | "account_ip";
    endpoint?: string;
    identifier?: string;
    kind?: "at_limit" | "login_lockouts";
    sortBy?: "endpoint" | "scope" | "identifier" | "count" | "resets_at";
    sortDir?: "asc" | "desc";
}

// Matches rate_limiter_service.py's _SCAN_SNAPSHOT_TTL_SECONDS: polling
// faster wouldn't show anything new, since the backend serves the same
// cached SCAN snapshot within that window anyway.
const POLL_INTERVAL_MS = 5000;

/**
 * Numbered-page pagination, like the audit log's queries: the backend walks the
 * matching Valkey keyspace to compute a real total and slice one page.
 *
 * keepPreviousData stops page switches and the 5s background poll from flashing
 * the loading skeleton over an unchanged table. refetchIntervalInBackground
 * defaults to false, so polling pauses while the tab is hidden and refetches
 * immediately when it regains focus.
 */
export function useRateLimitsQuery(page: number, pageSize: number, filters: RateLimitsFilters = {}) {
    return useQuery({
        queryKey: [...RATE_LIMITS_QUERY_KEY, page, pageSize, filters],
        queryFn: async () => {
            const res = await listRateLimitsApi({ page, pageSize, ...filters });
            return res.data;
        },
        refetchInterval: POLL_INTERVAL_MS,
    });
}
