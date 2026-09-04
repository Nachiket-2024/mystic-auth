import { useMutation } from "@tanstack/react-query";

import {
    bulkAssignPoliciesApi,
    bulkRemovePoliciesApi,
    bulkAssignPermissionsApi,
    bulkRemovePermissionsApi,
    bulkUpdateRoleApi,
    type BulkResponse,
} from "../../api/bulkAssignment_api";
import { extractApiErrorMessage } from "../../api/apiError";
import { queryClient } from "../../core/queryClient";
import { useAuthStore } from "../../store/authStore";
import { CURRENT_USER_QUERY_KEY } from "../../auth/current_user/useCurrentUserQuery";
import { markSelfPermissionMutation } from "../../auth/session_lifecycle/selfPermissionMutationGuard";
import { MY_POLICIES_QUERY_KEY, userPoliciesQueryKey } from "./policyQueries";
import { MY_PERMISSIONS_QUERY_KEY, userPermissionsQueryKey } from "./permissionQueries";
import { USERS_QUERY_KEY } from "../../users/queries/userQueries";

/** A bulk response fans out across many users, so there's no single query
 * key to invalidate like the single-item mutations do. Each mutation below
 * invalidates once per distinct user_email actually present in the
 * response, not the request, since an item that errored before reaching
 * the database shouldn't trigger a refetch for an unchanged user. */
function distinctEmails(data: BulkResponse): string[] {
    return [...new Set(data.results.map((r) => r.user_email))];
}

/**
 * `marksPermissionChange` also arms selfPermissionMutationGuard, so this
 * tab's own "permissions_changed" SSE echo (see useSessionEventsStream.ts)
 * isn't read as a live revoke before the invalidation above resolves. Only
 * pass it for a bulk mutation that can actually emit that event for the
 * caller themselves - not the role mutation below, whose targets can never
 * include the caller (the backend rejects a self-targeted role change).
 */
function invalidateSelfIfIncluded(emails: string[], options?: { marksPermissionChange?: boolean }) {
    if (!emails.includes(useAuthStore.getState().email ?? "")) return;
    queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
    if (options?.marksPermissionChange) {
        markSelfPermissionMutation();
    }
}

function wrapError(action: string) {
    return (error: unknown) => {
        throw new Error(extractApiErrorMessage(error, action), { cause: error });
    };
}

export function useBulkAssignPoliciesMutation() {
    return useMutation<BulkResponse, Error, { userEmails: string[]; policyName: string }>({
        mutationFn: async ({ userEmails, policyName }) => {
            try {
                return (await bulkAssignPoliciesApi(userEmails, policyName)).data;
            } catch (error) {
                return wrapError("Failed to bulk-assign policy")(error);
            }
        },
        onSuccess: (data) => {
            const emails = distinctEmails(data);
            emails.forEach((email) => queryClient.invalidateQueries({ queryKey: userPoliciesQueryKey(email) }));
            queryClient.invalidateQueries({ queryKey: MY_POLICIES_QUERY_KEY });
            invalidateSelfIfIncluded(emails, { marksPermissionChange: true });
        },
    });
}

export function useBulkRemovePoliciesMutation() {
    return useMutation<BulkResponse, Error, { userEmails: string[]; policyName: string }>({
        mutationFn: async ({ userEmails, policyName }) => {
            try {
                return (await bulkRemovePoliciesApi(userEmails, policyName)).data;
            } catch (error) {
                return wrapError("Failed to bulk-remove policy")(error);
            }
        },
        onSuccess: (data) => {
            const emails = distinctEmails(data);
            emails.forEach((email) => queryClient.invalidateQueries({ queryKey: userPoliciesQueryKey(email) }));
            queryClient.invalidateQueries({ queryKey: MY_POLICIES_QUERY_KEY });
            invalidateSelfIfIncluded(emails, { marksPermissionChange: true });
        },
    });
}

export function useBulkAssignPermissionsMutation() {
    return useMutation<
        BulkResponse,
        Error,
        { userEmails: string[]; action: string; resourceType: string; conditions?: Record<string, unknown> }
    >({
        mutationFn: async ({ userEmails, action, resourceType, conditions }) => {
            try {
                return (await bulkAssignPermissionsApi(userEmails, action, resourceType, conditions)).data;
            } catch (error) {
                return wrapError("Failed to bulk-grant permission")(error);
            }
        },
        onSuccess: (data) => {
            const emails = distinctEmails(data);
            emails.forEach((email) => queryClient.invalidateQueries({ queryKey: userPermissionsQueryKey(email) }));
            queryClient.invalidateQueries({ queryKey: MY_PERMISSIONS_QUERY_KEY });
            invalidateSelfIfIncluded(emails, { marksPermissionChange: true });
        },
    });
}

export function useBulkRemovePermissionsMutation() {
    return useMutation<BulkResponse, Error, { userEmails: string[]; action: string; resourceType: string }>({
        mutationFn: async ({ userEmails, action, resourceType }) => {
            try {
                return (await bulkRemovePermissionsApi(userEmails, action, resourceType)).data;
            } catch (error) {
                return wrapError("Failed to bulk-revoke permission")(error);
            }
        },
        onSuccess: (data) => {
            const emails = distinctEmails(data);
            emails.forEach((email) => queryClient.invalidateQueries({ queryKey: userPermissionsQueryKey(email) }));
            queryClient.invalidateQueries({ queryKey: MY_PERMISSIONS_QUERY_KEY });
            invalidateSelfIfIncluded(emails, { marksPermissionChange: true });
        },
    });
}

export function useBulkUpdateRoleMutation() {
    return useMutation<BulkResponse, Error, { userEmails: string[]; role: string }>({
        mutationFn: async ({ userEmails, role }) => {
            try {
                return (await bulkUpdateRoleApi(userEmails, role)).data;
            } catch (error) {
                return wrapError("Failed to bulk-update role")(error);
            }
        },
        onSuccess: (data) => {
            const emails = distinctEmails(data);
            // Unlike the policy/permission mutations above, the users table
            // itself renders the role column, not a separate per-user
            // dialog, so the list query needs invalidating too.
            queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
            invalidateSelfIfIncluded(emails);
        },
    });
}
