import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
    listPoliciesApi,
    getPolicyHistoryApi,
    getMyPoliciesApi,
    getUserPoliciesApi,
    type ListPoliciesParams,
    type PolicyRead,
} from "../api/policies_api";
import type { SortDirection } from "../ui/hooks/useSortState";

export const POLICIES_QUERY_KEY = ["policies"] as const;
export const policyHistoryQueryKey = (policyName: string) => ["policies", policyName, "history"] as const;
export const MY_POLICIES_QUERY_KEY = ["policies", "me"] as const;
export const userPoliciesQueryKey = (userEmail: string) => ["policies", "user", userEmail] as const;

// Policies themselves (as opposed to who they're assigned to) change rarely
// - a user editing PoliciesPage explicitly invalidates this key on
// save/delete (see policyMutations.ts), so a longer staleTime here doesn't
// risk showing stale data after an actual edit, it just avoids refetching
// this list on every unrelated remount/refocus.
const POLICIES_STALE_TIME = 5 * 60 * 1000;

/** The full, unfiltered policy list (still id-ordered, still capped at the
 * backend's default limit=1000) - used by call sites that want every
 * policy at once, not one page of them: UserPoliciesDialog's "assign a
 * policy" dropdown. PoliciesPage itself uses usePoliciesListQuery below,
 * which pages/filters/sorts server-side. */
export function usePoliciesQuery(enabled = true) {
    return useQuery({
        queryKey: POLICIES_QUERY_KEY,
        queryFn: async () => (await listPoliciesApi()).data,
        staleTime: POLICIES_STALE_TIME,
        enabled,
    });
}

export interface PoliciesPage {
    policies: PolicyRead[];
    /** From the X-Total-Count response header; 0 if the header is somehow
     * missing rather than throwing, so a transient proxy/CORS misconfig
     * degrades to "no pages" instead of crashing the page. */
    total: number;
}

export interface PoliciesListFilters {
    search?: string;
    resourceType?: string;
    isActive?: boolean;
    sortBy?: string;
    sortDir?: SortDirection;
}

/** Server-side paged/filtered/sorted policy list, same shape as
 * userQueries.ts's useUsersQuery - queryKey is prefixed with
 * POLICIES_QUERY_KEY (not a separate top-level key) so policyMutations.ts's
 * existing `invalidateQueries({queryKey: POLICIES_QUERY_KEY})` on
 * create/update/delete invalidates this alongside the unpaginated
 * usePoliciesQuery above, with no changes needed there. */
export function usePoliciesListQuery(page: number, pageSize: number, filters: PoliciesListFilters = {}) {
    const params: ListPoliciesParams = { limit: pageSize, offset: (page - 1) * pageSize, ...filters };
    return useQuery<PoliciesPage>({
        queryKey: [...POLICIES_QUERY_KEY, "list", page, pageSize, filters],
        queryFn: async () => {
            const res = await listPoliciesApi(params);
            const total = Number(res.headers["x-total-count"]);
            return { policies: res.data, total: Number.isFinite(total) ? total : 0 };
        },
        // Keeps the current page's rows on screen while a different
        // page/filter/sort loads in, same reasoning as useUsersQuery.
        placeholderData: keepPreviousData,
    });
}

export function usePolicyHistoryQuery(policyName: string, enabled = true) {
    return useQuery({
        queryKey: policyHistoryQueryKey(policyName),
        queryFn: async () => (await getPolicyHistoryApi(policyName)).data,
        enabled: enabled && !!policyName,
    });
}

export function useMyPoliciesQuery() {
    return useQuery({
        queryKey: MY_POLICIES_QUERY_KEY,
        queryFn: async () => (await getMyPoliciesApi()).data,
        staleTime: POLICIES_STALE_TIME,
    });
}

export function useUserPoliciesQuery(userEmail: string, enabled = true) {
    return useQuery({
        queryKey: userPoliciesQueryKey(userEmail),
        queryFn: async () => (await getUserPoliciesApi(userEmail)).data,
        enabled: enabled && !!userEmail,
    });
}
