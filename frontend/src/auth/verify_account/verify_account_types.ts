// ---------------------------- Account Verification Payload Type ----------------------------
/**
 * VerifyAccountPayload
 * ----------------------------
 * Defines the shape of the request to verify account via token and email
 * Fields:
 *   1. token - Verification token sent to user's email
 *   2. email - Email address of the user being verified
 */
export interface VerifyAccountPayload {
    token: string;   // Step 1: Verification token from email
    email: string;   // Step 2: User email address
}

// ---------------------------- Account Verification Response Type ----------------------------
/**
 * VerifyAccountResponse
 * ----------------------------
 * Defines the shape of the response from backend after account verification
 * Fields:
 *   1. message - Success message indicating verification was successful
 */
export interface VerifyAccountResponse {
    message: string; // Step 1: Success confirmation message
}