// ---------------------------- Login Request Type ----------------------------
/**
 * LoginRequest
 * ----------------------------
 * Defines the shape of the request body sent to /auth/login endpoint
 * Fields:
 *   1. email - User's email address for authentication
 *   2. password - User's password for authentication
 */
export interface LoginRequest {
    // Step 1: User's email address
    email: string;

    // Step 2: User's password
    password: string;
}

// ---------------------------- Login Response Type ----------------------------
/**
 * LoginResponse
 * ----------------------------
 * Defines the shape of the response received from /auth/login endpoint
 * Fields:
 *   1. access_token - JWT access token returned by the server
 *   2. refresh_token - JWT refresh token returned by the server
 */
export interface LoginResponse {
    // Step 1: JWT access token for authenticating subsequent requests
    access_token: string;

    // Step 2: JWT refresh token for obtaining new access tokens
    refresh_token: string;
}