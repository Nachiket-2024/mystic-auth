export interface PasswordResetConfirmPayload {
    token: string;
    new_password: string;
}

export interface PasswordResetConfirmResponse {
    message: string;
    // false only when the reset itself succeeded but the account's other
    // sessions couldn't be confirmed as revoked (Redis unreachable) - see
    // backend's password_reset_service.reset_password and
    // docs/mystic_auth/authentication/session-management.md#bump-failure-handling.
    sessions_revoked: boolean;
}
