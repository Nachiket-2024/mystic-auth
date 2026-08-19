import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { listRateLimitsApi } from "../api/rate_limits_api";

export const RATE_LIMITS_QUERY_KEY = ["rate-limits"] as const;

export interface RateLimitsFilters {
    scope?: "ip" | "account" | "email";
    endpoint?: string;
    identifier?: string;
}

/**
 * Numbered-page pagination, same shape as the audit log's queries: the
 * backend walks the matching Redis keyspace (bounded, see rate_limiter_
 * service.py's list_active_limits) to compute a real total and slice out
 * one page, rather than the old Prev/Next-only cursor shape.
 *
 * keepPreviousData: without it, switching pages briefly flashes the
 * loading skeleton over an otherwise-unchanged table (filters/columns are
 * identical - only the page's rows differ), which reads as a bigger UI
 * change than moving one page actually is.
 */
export function useRateLimitsQuery(page: number, pageSize: number, filters: RateLimitsFilters = {}) {
    return useQuery({
        queryKey: [...RATE_LIMITS_QUERY_KEY, page, pageSize, filters],
        queryFn: async () => {
            const res = await listRateLimitsApi({ page, pageSize, ...filters });
            return res.data;
        },
        placeholderData: keepPreviousData,
    });
}
