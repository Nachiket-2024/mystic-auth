// ---------------------------- External Imports ----------------------------
// Import configured Axios instance for making HTTP requests
import api from "./axiosInstance";

// ---------------------------- Auth API Calls ----------------------------
/**
 * signupApi
 * ----------------------------
 * Input: payload containing name, email, and password
 * Process: Sends POST request to /auth/signup endpoint
 * Output: Axios promise with signup response
 */
export const signupApi = (payload: { name: string; email: string; password: string }) =>
    api.post("/auth/signup", payload);

/**
 * loginApi
 * ----------------------------
 * Input: payload containing email and password
 * Process: Sends POST request to /auth/login endpoint
 * Output: Axios promise with login response (tokens set as cookies)
 */
export const loginApi = (payload: { email: string; password: string }) =>
    api.post("/auth/login", payload);

/**
 * getCurrentUserApi
 * ----------------------------
 * Input: src (optional string to track caller source for debugging)
 * Process: Sends GET request to /auth/me endpoint
 * Output: Axios promise with current user data (name, email, role)
 */
export const getCurrentUserApi = (src: string = "unknown") =>
    api.get("/auth/me", { params: { src } });

/**
 * oauth2LoginGoogleApi
 * ----------------------------
 * Input: None
 * Process: Sends GET request to initiate Google OAuth2 login flow
 * Output: Axios promise with redirect URL or OAuth2 initiation response
 */
export const oauth2LoginGoogleApi = () =>
    api.get("/auth/oauth2/login/google");

/**
 * oauth2CallbackGoogleApi
 * ----------------------------
 * Input: code (authorization code from Google OAuth2 callback)
 * Process: Sends GET request to exchange code for authentication tokens
 * Output: Axios promise with login response
 */
export const oauth2CallbackGoogleApi = (code: string) =>
    api.get("/auth/oauth2/callback/google", { params: { code } });

/**
 * logoutApi
 * ----------------------------
 * Input: None (refresh_token extracted from cookies automatically)
 * Process: Sends POST request to revoke current session's refresh token
 * Output: Axios promise with logout confirmation
 */
export const logoutApi = () =>
    api.post("/auth/logout");

/**
 * logoutAllApi
 * ----------------------------
 * Input: None (refresh_token extracted from cookies automatically)
 * Process: Sends POST request to revoke ALL refresh tokens for the user
 * Output: Axios promise with logout-all confirmation
 */
export const logoutAllApi = () =>
    api.post("/auth/logout/all");

/**
 * passwordResetRequestApi
 * ----------------------------
 * Input: payload containing email address
 * Process: Sends POST request to request password reset email
 * Output: Axios promise with confirmation message
 */
export const passwordResetRequestApi = (payload: { email: string }) =>
    api.post("/auth/password-reset/request", payload);

/**
 * passwordResetConfirmApi
 * ----------------------------
 * Input: payload containing token and new_password
 * Process: Sends POST request to confirm password reset with token
 * Output: Axios promise with password reset confirmation
 */
export const passwordResetConfirmApi = (payload: { token: string; new_password: string }) =>
    api.post("/auth/password-reset/confirm", payload);

/**
 * verifyAccountApi
 * ----------------------------
 * Input: token (verification token), email (user's email address)
 * Process: Sends GET request to verify user's email account
 * Output: Axios promise with account verification confirmation
 */
export const verifyAccountApi = (token: string, email: string) =>
    api.get("/auth/verify-account", { params: { token, email } });