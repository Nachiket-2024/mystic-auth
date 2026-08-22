import { useAuthStore } from "../../store/authStore";
import { queryClient } from "../../core/queryClient";
import { CURRENT_USER_QUERY_KEY } from "../current_user/useCurrentUserQuery";
import { SESSIONS_QUERY_KEY } from "../../dashboard/manage_sessions/useSessionsQuery";
import { MY_POLICIES_QUERY_KEY } from "../../policies/policyQueries";
import { MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY } from "../../audit_log/authorization_log/authorizationLogQueries";
import { MY_SECURITY_AUDIT_LOG_QUERY_KEY } from "../../audit_log/security_log/securityLogQueries";

/**
 * Marks the caller signed out and drops every "me"-scoped query. Shared by
 * every mutation that ends this browser's session - useLogoutMutation,
 * useLogoutAllMutation, useDeleteMyAccountMutation,
 * useConfirmDeleteMyAccountMutation - since each reaches the same
 * post-logout state (nothing "me"-scoped should flash stale for whoever
 * uses this browser next) from a different API call, so only the cleanup
 * itself is factored out, not the surrounding mutation.
 */
export function clearMyAccountSessionCaches(): void {
    useAuthStore.getState().setAuthenticated(false);
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
    // Removed, not just invalidated: none of these "me"-scoped queries are
    // keyed by email, so a stale one must never flash on screen for
    // whoever uses this browser next, even for the instant before a
    // refetch would land. MY_SECURITY_AUDIT_LOG_QUERY_KEY's prefix match
    // also covers its own children, LAST_LOGIN_QUERY_KEY and
    // MY_LOGIN_TREND_QUERY_KEY, so they don't need a separate call.
    queryClient.removeQueries({ queryKey: SESSIONS_QUERY_KEY });
    queryClient.removeQueries({ queryKey: MY_POLICIES_QUERY_KEY });
    queryClient.removeQueries({ queryKey: MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY });
    queryClient.removeQueries({ queryKey: MY_SECURITY_AUDIT_LOG_QUERY_KEY });
}
