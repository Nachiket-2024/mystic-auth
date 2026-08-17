import { useMutation } from "@tanstack/react-query";

import {
    deleteMyAccountApi,
    type DeleteMyAccountPayload,
    type DeleteMyAccountResponse,
} from "../api/account_settings_api";
import { extractApiErrorMessage } from "../api/apiError";
import { useAuthStore } from "../store/authStore";
import { queryClient } from "../core/queryClient";
import { CURRENT_USER_QUERY_KEY } from "../auth/current_user/useCurrentUserQuery";
import { SESSIONS_QUERY_KEY } from "../dashboard/manage_sessions/useSessionsQuery";
import { MY_POLICIES_QUERY_KEY } from "../policies/policyQueries";
import { MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY } from "../audit_log/authorization_log/authorizationLogQueries";
import { MY_SECURITY_AUDIT_LOG_QUERY_KEY } from "../audit_log/security_log/securityLogQueries";

/**
 * useDeleteMyAccountMutation
 * ----------------------------
 * DELETE /users/me. For a password-holding account this soft-deletes the
 * caller's own account immediately (revoked sessions, recoverable by an
 * admin for ACCOUNT_PURGE_GRACE_DAYS, then permanently purged - see
 * DeleteAccountCard.tsx's copy and docs/mystic_auth/security/decisions.md).
 * The route itself already revokes every session including this one, so on
 * that success path this mirrors useLogoutMutation's cache cleanup exactly:
 * mark unauthenticated immediately rather than waiting on a currentUser
 * refetch that would 401 by design, and drop every "me"-scoped query so
 * nothing stale can flash for whoever uses this browser next.
 *
 * For an OAuth-only account (no password to re-confirm with), the response
 * instead carries `confirmation_required: true`: nothing was deleted yet,
 * only a confirmation email was sent, so this session and its caches stay
 * exactly as they were - DeleteAccountCard.tsx branches on that flag to show
 * "check your email" messaging instead of navigating away.
 */
export function useDeleteMyAccountMutation() {
    return useMutation<DeleteMyAccountResponse, Error, DeleteMyAccountPayload>({
        mutationFn: async (payload) => {
            try {
                const res = await deleteMyAccountApi(payload);
                return res.data;
            } catch (error) {
                throw new Error(extractApiErrorMessage(error, "Failed to delete account"), { cause: error });
            }
        },
        onSuccess: (data) => {
            if (data.confirmation_required) {
                return;
            }

            useAuthStore.getState().setAuthenticated(false);
            queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
            queryClient.removeQueries({ queryKey: SESSIONS_QUERY_KEY });
            queryClient.removeQueries({ queryKey: MY_POLICIES_QUERY_KEY });
            queryClient.removeQueries({ queryKey: MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY });
            queryClient.removeQueries({ queryKey: MY_SECURITY_AUDIT_LOG_QUERY_KEY });
        },
    });
}
