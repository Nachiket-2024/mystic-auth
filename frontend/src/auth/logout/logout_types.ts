// ---------------------------- Logout Response Type ----------------------------
/**
 * LogoutResponse
 * ----------------------------
 * Defines the shape of the response received from /auth/logout or /auth/logout/all endpoints
 * Fields:
 *   1. message - Success message returned by the API confirming logout
 */
export interface LogoutResponse {
    // Step 1: Success message from the API
    message: string;
}