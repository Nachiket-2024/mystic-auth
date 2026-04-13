// ---------------------------- Password Reset Confirm Payload Type ----------------------------
/**
 * PasswordResetConfirmPayload
 * ----------------------------
 * Defines the shape of the request body sent to /auth/password-reset/confirm endpoint
 * Fields:
 *   1. token - Token received by email to verify the reset request
 *   2. new_password - New password that the user wants to set
 */
export interface PasswordResetConfirmPayload {
    // Step 1: Verification token from email
    token: string;

    // Step 2: New password to set for the user account
    new_password: string;
}

// ---------------------------- Password Reset Confirm Response Type ----------------------------
/**
 * PasswordResetConfirmResponse
 * ----------------------------
 * Defines the shape of the response received from /auth/password-reset/confirm endpoint
 * Fields:
 *   1. message - Success message indicating password reset was successful
 */
export interface PasswordResetConfirmResponse {
    // Step 1: Success message from the API
    message: string;
}