// ---------------------------- External Imports ----------------------------
// Import React for JSX/TSX syntax and functional components
import React from "react";

// Import Redux useSelector hook to access state
import { useSelector } from "react-redux";

// ---------------------------- Internal Imports ----------------------------
// Import TypedUseSelectorHook for TypeScript typing
import type { TypedUseSelectorHook } from "react-redux";

// Import RootState type for strongly-typed Redux state
import type { RootState } from "../../store/store";

// Import application settings, including API base URL
import settings from "../../core/settings";

// Import presentational component that renders the button and UI
import OAuth2LoginButtonComponent from "./OAuth2LoginButtonComponent";

// ---------------------------- Props Interface Definition ----------------------------
/**
 * OAuth2ButtonProps
 * ----------------------------
 * Defines the props accepted by the OAuth2LoginButton container component
 * Fields:
 *   1. onSuccess - Optional callback executed after successful login
 *   2. onAttempt - Optional callback triggered when a login attempt occurs
 */
interface OAuth2ButtonProps {
    onSuccess?: () => void;  // Step 1: Success callback
    onAttempt?: () => void;  // Step 2: Attempt callback
}

// ---------------------------- Typed Selector Hook ----------------------------
// Create a typed selector for strong typing when accessing Redux state
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ---------------------------- OAuth2LoginButton Container ----------------------------
/**
 * OAuth2LoginButton
 * ----------------------------
 * Container component handling OAuth2 login state
 * Responsibilities:
 *   1. Reads authentication and error state from Redux
 *   2. Provides login handler to trigger OAuth2 redirect
 *   3. Passes state and handler down to presentational component
 * 
 * Input: OAuth2ButtonProps (onSuccess, onAttempt)
 * Process:
 *   1. Select OAuth2 slice state from Redux
 *   2. Select global authentication state from currentUser slice
 *   3. Define handleLogin to trigger OAuth2 redirect
 *   4. Render presentational component with state and callbacks
 * Output: JSX.Element representing OAuth2 login button container
 */
const OAuth2LoginButton: React.FC<OAuth2ButtonProps> = ({ onAttempt }) => {
    // ---------------------------- Redux State Selection ----------------------------
    // Step 1: Select OAuth2 slice state (error, isAuthenticated, user)
    const { error, isAuthenticated, user } = useAppSelector(state => state.oauth2);

    // Step 2: Select global authentication state and coerce to boolean
    const globalAuthRaw = useAppSelector(state => state.currentUser.isAuthenticated);
    const globalAuth: boolean = !!globalAuthRaw; // Convert null or undefined to false

    // ---------------------------- Event Handlers ----------------------------
    /**
     * handleLogin
     * ----------------------------
     * Input: None
     * Process:
     *   1. Call optional onAttempt callback to notify parent component
     *   2. Redirect browser window to Google OAuth2 login endpoint
     * Output: void (triggers browser redirect)
     */
    const handleLogin = () => {
        onAttempt?.(); // Step 1: Notify parent of login attempt
        window.location.href = `${settings.apiBaseUrl}/auth/oauth2/login/google`; // Step 2: Perform OAuth2 redirect
    };

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render OAuth2LoginButtonComponent with Redux state
     *   2. Pass error message for display
     *   3. Pass OAuth2 authentication state
     *   4. Pass OAuth2 user information
     *   5. Pass global authentication state as boolean
     *   6. Pass handleLogin as onLogin callback
     * Output: JSX.Element
     */
    return (
        <OAuth2LoginButtonComponent
            error={error}                      // Step 1: Pass error message
            isAuthenticated={isAuthenticated}  // Step 2: Pass OAuth2 auth state
            user={user}                        // Step 3: Pass OAuth2 user info
            globalAuth={globalAuth}            // Step 4: Pass global auth state (boolean)
            onLogin={handleLogin}              // Step 5: Pass login handler
        />
    );
};

// ---------------------------- Export ----------------------------
// Export container component for use in login pages
export default OAuth2LoginButton;