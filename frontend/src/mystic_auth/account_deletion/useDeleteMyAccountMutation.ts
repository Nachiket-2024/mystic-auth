import { useMutation } from "@tanstack/react-query";

import {
    deleteMyAccountApi,
    type DeleteMyAccountPayload,
    type DeleteMyAccountResponse,
} from "../api/account_settings_api";
import { extractApiErrorMessage } from "../api/apiError";
import { clearMyAccountSessionCaches } from "../auth/session_lifecycle/clearMyAccountSessionCaches";

/**
 * useDeleteMyAccountMutation
 * ----------------------------
 * DELETE /users/me. For a password account this soft-deletes immediately
 * (sessions revoked, recoverable by a permission holder for
 * ACCOUNT_PURGE_GRACE_DAYS, then purged; see DeleteAccountCard.tsx and
 * docs/mystic_auth/security/decisions.md). Every session is already revoked,
 * so on success this mirrors useLogoutMutation: mark unauthenticated at once
 * (a currentUser refetch would 401) and drop every "me"-scoped query.
 *
 * For an OAuth-only account (no password to confirm with) the response carries
 * `confirmation_required: true`: only a confirmation email was sent, nothing
 * is deleted, and the session stays. DeleteAccountCard.tsx shows "check your
 * email" instead of navigating away.
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

            clearMyAccountSessionCaches();
        },
    });
}
