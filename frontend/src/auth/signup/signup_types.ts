// ---------------------------- Signup Request Type ----------------------------
/**
 * SignupRequest
 * ----------------------------
 * Defines the shape of the request payload sent to /auth/signup endpoint
 * Fields:
 *   1. name - Full name of the user
 *   2. email - User email address for signup
 *   3. password - Password chosen by the user
 */
export interface SignupRequest {
    name: string;     // Step 1: User's full name
    email: string;    // Step 2: User email address
    password: string; // Step 3: User chosen password
}

// ---------------------------- Signup Response Type ----------------------------
/**
 * SignupResponse
 * ----------------------------
 * Defines the shape of the response returned from /auth/signup endpoint
 * Fields:
 *   1. message - Success message indicating signup was successful
 *   2. user_id - Optional ID of the newly created user
 */
export interface SignupResponse {
    message: string;  // Step 1: Success confirmation message
    user_id?: string; // Step 2: Optional user identifier
}