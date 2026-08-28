import { useQuery } from "@tanstack/react-query";

import { getMyPermissionsApi, getPermissionCatalogApi, getUserPermissionsApi } from "../../api/permissions_api";

export const MY_PERMISSIONS_QUERY_KEY = ["permissions", "me"] as const;
export const userPermissionsQueryKey = (userEmail: string) => ["permissions", "user", userEmail] as const;
export const PERMISSION_CATALOG_QUERY_KEY = ["permissions", "catalog"] as const;

// The catalog is fixed, code-defined vocabulary (see backend's
// authorization/permissions_catalog.py) - it only ever changes on deploy,
// never at runtime, so a long staleTime avoids refetching it on every
// unrelated remount/refocus across every dropdown that uses it.
const PERMISSION_CATALOG_STALE_TIME = 30 * 60 * 1000;

/** The full permission catalog - source for every action/resource_type
 * dropdown in the app (UserPermissionsDialog, BulkPermissionGrantDialog,
 * PolicyFormDialog) as well as PermissionsPage's own browsable list and
 * CommandPaletteResults' catalog-entry search. `enabled` defaults true
 * (every existing caller wants it fetched unconditionally); CommandPalette
 * passes false for viewers who can't reach the Permissions page, so it
 * never issues the request just because the palette mounted. Shared
 * queryKey means whichever caller fetches first satisfies the rest from
 * cache. */
export function usePermissionCatalogQuery(enabled = true) {
    return useQuery({
        queryKey: PERMISSION_CATALOG_QUERY_KEY,
        queryFn: async () => (await getPermissionCatalogApi()).data,
        staleTime: PERMISSION_CATALOG_STALE_TIME,
        enabled,
    });
}

export function useMyPermissionsQuery(enabled = true) {
    return useQuery({
        queryKey: MY_PERMISSIONS_QUERY_KEY,
        queryFn: async () => (await getMyPermissionsApi()).data,
        // See useMyPoliciesQuery's matching comment (policyQueries.ts) for
        // why this needs an off switch: UserDetailsDialog only wants it
        // when the viewer opened their own row. Defaults true so
        // AccountStatusCard, which always wants it, stays unchanged.
        enabled,
    });
}

export function useUserPermissionsQuery(userEmail: string, enabled = true) {
    return useQuery({
        queryKey: userPermissionsQueryKey(userEmail),
        queryFn: async () => (await getUserPermissionsApi(userEmail)).data,
        enabled: enabled && !!userEmail,
    });
}
