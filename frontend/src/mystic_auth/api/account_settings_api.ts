import api from "../api/axiosInstance";
import type { ManagedUserRead, UserUpdatePayload } from "../api/users_api";

export const updateMyAccountApi = (payload: UserUpdatePayload) => api.put<ManagedUserRead>("/users/me", payload);

export interface DeleteMyAccountPayload {
    // Required to confirm the caller's own account; omitted for an
    // OAuth-only account (has_password=false) with no password to confirm
    // against, same exemption as changing a password.
    current_password?: string;
}

export interface DeleteMyAccountResponse {
    detail: string;
    // Only set (true) for an OAuth-only account: the account was NOT
    // deleted by this call, only a confirmation email was sent - see
    // useConfirmDeleteMyAccountMutation.ts for the flow that actually
    // deletes it once the caller clicks the link.
    confirmation_required?: boolean;
}

// Self-service soft delete (reversible for ACCOUNT_PURGE_GRACE_DAYS, see
// docs/mystic_auth/security/decisions.md#account-lifecycle-soft-delete-by-default):
// axios's `delete` only sends a body via `{ data }`, not a positional arg.
//
// For a password-holding account this deletes immediately. For an
// OAuth-only account (has_password=false), it instead sends a confirmation
// email (confirmation_required=true in the response) and leaves the account
// untouched until POST /users/me/confirm-delete redeems the link.
export const deleteMyAccountApi = (payload: DeleteMyAccountPayload) =>
    api.delete<DeleteMyAccountResponse>("/users/me", { data: payload });

export interface ConfirmDeleteMyAccountPayload {
    token: string;
}

export interface ConfirmDeleteMyAccountResponse {
    message: string;
}

// Unauthenticated: the signed, single-use token in the body is itself the
// proof of intent, same trust model as POST /auth/password-reset/confirm.
export const confirmDeleteMyAccountApi = (payload: ConfirmDeleteMyAccountPayload) =>
    api.post<ConfirmDeleteMyAccountResponse>("/users/me/confirm-delete", payload);
