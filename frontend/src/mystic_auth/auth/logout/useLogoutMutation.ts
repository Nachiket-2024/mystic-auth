import { useMutation } from "@tanstack/react-query";

import { logoutApi } from "../../api/auth_api";
import { extractApiErrorMessage } from "../../api/apiError";
import { useAuthStore } from "../../store/authStore";
import { queryClient } from "../../core/queryClient";
import { CURRENT_USER_QUERY_KEY } from "../current_user/useCurrentUserQuery";
import { SESSIONS_QUERY_KEY } from "../../dashboard/manage_sessions/useSessionsQuery";
import { MY_POLICIES_QUERY_KEY } from "../../policies/policyQueries";
import { MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY } from "../../audit_log/authorization_log/authorizationLogQueries";
import { MY_SECURITY_AUDIT_LOG_QUERY_KEY } from "../../audit_log/security_log/securityLogQueries";
import type { LogoutResponse } from "./logout_types";

// Marks the auth store unauthenticated immediately rather than waiting on a
// currentUser refetch that would 401 by design. Deliberately
// `setAuthenticated(false)`, not `reset()`: `reset()` puts isAuthenticated
// back to null, which ProtectedRoute reads as "still checking the session"
// (spinner) rather than "log out now" (immediate redirect).
//
// This local cleanup runs in onSettled, not onSuccess: POST /auth/logout
// itself 400s (NO_REFRESH_TOKEN_COOKIE) whenever the refresh_token cookie is
// already gone - e.g. it expired while this tab sat idle, or a sibling
// tab/device already logged this session out. Gating the cleanup on success
// meant that response threw, onSuccess never ran, and LogoutButton's
// navigate-on-isSuccess effect never fired: the user stayed stuck looking at
// the (now-401ing) page they were on, with no visible feedback, until they
// manually reloaded. The user's actual goal on clicking Logout - no valid
// session left in this browser - is achieved by clearing local state
// regardless of how the backend call landed, mirroring the backend
// handler's own "always clear cookies, even for an already-dead session"
// stance (see logout_handler.py).
export function useLogoutMutation() {
    return useMutation<LogoutResponse, Error, void>({
        mutationFn: async () => {
            try {
                const res = await logoutApi();
                return res.data;
            } catch (error) {
                throw new Error(extractApiErrorMessage(error, "Logout failed"), { cause: error });
            }
        },
        onSettled: () => {
            useAuthStore.getState().setAuthenticated(false);
            queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
            // Removed, not just invalidated: none of these "me"-scoped
            // queries are keyed by email, so a stale one (sessions, policy
            // assignments, audit history) must never flash on screen for
            // whoever logs in next in this browser, even for the instant
            // before a refetch would land. MY_SECURITY_AUDIT_LOG_QUERY_KEY's
            // prefix match also covers its own children, LAST_LOGIN_QUERY_KEY
            // and MY_LOGIN_TREND_QUERY_KEY, so they don't need a separate call.
            queryClient.removeQueries({ queryKey: SESSIONS_QUERY_KEY });
            queryClient.removeQueries({ queryKey: MY_POLICIES_QUERY_KEY });
            queryClient.removeQueries({ queryKey: MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY });
            queryClient.removeQueries({ queryKey: MY_SECURITY_AUDIT_LOG_QUERY_KEY });
        },
    });
}
