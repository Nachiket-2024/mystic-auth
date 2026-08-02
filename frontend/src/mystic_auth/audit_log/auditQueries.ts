import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";

import {
    getAuthorizationAuditLogApi,
    getMyAuthorizationAuditLogApi,
    getUserAuthorizationAuditLogApi,
    getSecurityAuditLogApi,
    getMySecurityAuditLogApi,
    getLoginTrendApi,
    getMyLoginTrendApi,
} from "../api/audit_api";
import type { SortDirection } from "../ui/hooks/useSortState";

export const AUTHORIZATION_AUDIT_LOG_QUERY_KEY = ["auditLog", "authorization", "all"] as const;
export const MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY = ["auditLog", "authorization", "me"] as const;
export const userAuthorizationAuditLogQueryKey = (userEmail: string) =>
    ["auditLog", "authorization", "user", userEmail] as const;
export const SECURITY_AUDIT_LOG_QUERY_KEY = ["auditLog", "security", "all"] as const;
export const MY_SECURITY_AUDIT_LOG_QUERY_KEY = ["auditLog", "security", "me"] as const;

export interface AuditLogPageResult<T> {
    rows: T[];
    /** From the X-Total-Count response header; 0 if somehow missing rather
     * than throwing, so a transient proxy/CORS misconfig degrades to "no
     * pages" instead of crashing the page. */
    total: number;
}

function toPageResult<T>(res: AxiosResponse<T[]>): AuditLogPageResult<T> {
    const total = Number(res.headers["x-total-count"]);
    return { rows: res.data, total: Number.isFinite(total) ? total : 0 };
}

export interface AuthorizationLogFilters {
    search?: string;
    action?: string;
    resourceType?: string;
    allowed?: boolean;
    sortBy?: string;
    sortDir?: SortDirection;
}

export interface SecurityLogFilters {
    search?: string;
    eventType?: string;
    ipAddress?: string;
    success?: boolean;
    sortBy?: string;
    sortDir?: SortDirection;
}

// Every hook below pages via limit/offset (offset = (page-1)*pageSize) and
// keeps the previous page's rows on screen while the next one loads (see
// keepPreviousData), same reasoning as userQueries.ts's useUsersQuery: the
// table stays visually stable instead of flashing its loading skeleton on
// every page, sort, or filter change.

export function useAuthorizationAuditLogQuery(page: number, pageSize: number, filters: AuthorizationLogFilters = {}) {
    return useQuery({
        queryKey: [...AUTHORIZATION_AUDIT_LOG_QUERY_KEY, page, pageSize, filters],
        queryFn: async () =>
            toPageResult(
                await getAuthorizationAuditLogApi({ limit: pageSize, offset: (page - 1) * pageSize, ...filters })
            ),
        placeholderData: keepPreviousData,
    });
}

export function useMyAuthorizationAuditLogQuery(
    page: number, pageSize: number, filters: Omit<AuthorizationLogFilters, "search"> = {}
) {
    return useQuery({
        queryKey: [...MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY, page, pageSize, filters],
        queryFn: async () =>
            toPageResult(
                await getMyAuthorizationAuditLogApi({ limit: pageSize, offset: (page - 1) * pageSize, ...filters })
            ),
        placeholderData: keepPreviousData,
    });
}

export function useUserAuthorizationAuditLogQuery(userEmail: string, page: number, pageSize: number, enabled = true) {
    return useQuery({
        queryKey: [...userAuthorizationAuditLogQueryKey(userEmail), page, pageSize],
        queryFn: async () =>
            toPageResult(
                await getUserAuthorizationAuditLogApi(userEmail, { limit: pageSize, offset: (page - 1) * pageSize })
            ),
        enabled: enabled && !!userEmail,
        placeholderData: keepPreviousData,
    });
}

export function useSecurityAuditLogQuery(page: number, pageSize: number, filters: SecurityLogFilters = {}) {
    return useQuery({
        queryKey: [...SECURITY_AUDIT_LOG_QUERY_KEY, page, pageSize, filters],
        queryFn: async () =>
            toPageResult(await getSecurityAuditLogApi({ limit: pageSize, offset: (page - 1) * pageSize, ...filters })),
        placeholderData: keepPreviousData,
    });
}

export function useMySecurityAuditLogQuery(
    page: number, pageSize: number, filters: Omit<SecurityLogFilters, "search"> = {}
) {
    return useQuery({
        queryKey: [...MY_SECURITY_AUDIT_LOG_QUERY_KEY, page, pageSize, filters],
        queryFn: async () =>
            toPageResult(
                await getMySecurityAuditLogApi({ limit: pageSize, offset: (page - 1) * pageSize, ...filters })
            ),
        placeholderData: keepPreviousData,
    });
}

const LOGIN_TREND_QUERY_KEY = ["auditLog", "security", "all", "loginTrend"] as const;
export const MY_LOGIN_TREND_QUERY_KEY = ["auditLog", "security", "me", "loginTrend"] as const;

/** Daily login success/failure counts across every user, for the Audit Log
 * page's trend chart (security_audit:read required, same as the "All
 * users" security log tab). */
export function useLoginTrendQuery(days = 14) {
    return useQuery({
        queryKey: [...LOGIN_TREND_QUERY_KEY, days],
        queryFn: async () => (await getLoginTrendApi(days)).data,
    });
}

/** The caller's own daily login success/failure counts - no permission
 * required, same self-scoped reasoning as "My activity". */
export function useMyLoginTrendQuery(days = 14) {
    return useQuery({
        queryKey: [...MY_LOGIN_TREND_QUERY_KEY, days],
        queryFn: async () => (await getMyLoginTrendApi(days)).data,
    });
}
