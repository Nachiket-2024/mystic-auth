// ---------------------------- Password Reset Request Payload Type ----------------------------
/**
 * PasswordResetRequestPayload
 * ----------------------------
 * Defines the shape of the request body sent to /auth/password-reset/request endpoint
 * Fields:
 *   1. email - Email address of the user who will receive the password reset link
 */
export interface PasswordResetRequestPayload {
    // Step 1: User email address for password reset
    email: string;
}

// ---------------------------- Password Reset Request Response Type ----------------------------
/**
 * PasswordResetRequestResponse
 * ----------------------------
 * Defines the expected shape of the response from /auth/password-reset/request endpoint
 * Fields:
 *   1. message - Success message indicating that the password reset email was sent
 */
export interface PasswordResetRequestResponse {
    // Step 1: Success confirmation message from the API
    message: string;
}