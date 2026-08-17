import { useMutation } from "@tanstack/react-query";

import {
    confirmDeleteMyAccountApi,
    type ConfirmDeleteMyAccountPayload,
    type ConfirmDeleteMyAccountResponse,
} from "../../api/account_settings_api";
import { extractApiErrorMessage } from "../../api/apiError";
import { useAuthStore } from "../../store/authStore";
import { queryClient } from "../../core/queryClient";
import { CURRENT_USER_QUERY_KEY } from "../../auth/current_user/useCurrentUserQuery";
import { SESSIONS_QUERY_KEY } from "../../dashboard/manage_sessions/useSessionsQuery";
import { MY_POLICIES_QUERY_KEY } from "../../policies/policyQueries";
import { MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY } from "../../audit_log/authorization_log/authorizationLogQueries";
import { MY_SECURITY_AUDIT_LOG_QUERY_KEY } from "../../audit_log/security_log/securityLogQueries";

/**
 * useConfirmDeleteMyAccountMutation
 * ----------------------------
 * POST /users/me/confirm-delete: redeems an OAuth-only account's
 * email-confirmation token (see useDeleteMyAccountMutation.ts and
 * docs/mystic_auth/security/decisions.md#account-lifecycle) and actually
 * performs the deletion. Unauthenticated on the wire - the token is the
 * proof - but if this browser happens to still be holding the now-revoked
 * session for the deleted account (the link may just as easily be opened in
 * a different browser/device), the same cache cleanup
 * useDeleteMyAccountMutation's synchronous path applies still needs to run
 * here, or a stale "logged in" view could flash for it.
 */
export function useConfirmDeleteMyAccountMutation() {
    return useMutation<ConfirmDeleteMyAccountResponse, Error, ConfirmDeleteMyAccountPayload>({
        mutationFn: async (payload) => {
            try {
                const res = await confirmDeleteMyAccountApi(payload);
                return res.data;
            } catch (error) {
                throw new Error(extractApiErrorMessage(error, "Account deletion confirmation failed"), { cause: error });
            }
        },
        onSuccess: () => {
            useAuthStore.getState().setAuthenticated(false);
            queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
            queryClient.removeQueries({ queryKey: SESSIONS_QUERY_KEY });
            queryClient.removeQueries({ queryKey: MY_POLICIES_QUERY_KEY });
            queryClient.removeQueries({ queryKey: MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY });
            queryClient.removeQueries({ queryKey: MY_SECURITY_AUDIT_LOG_QUERY_KEY });
        },
    });
}
