// ---------------------------- External Imports ----------------------------
// Import React for JSX/TSX syntax and side effects
import React, { useEffect } from "react";

// Import Redux hooks for dispatching actions and accessing state
import { useDispatch, useSelector } from "react-redux";

// Type-only import for strongly-typed useSelector
import type { TypedUseSelectorHook } from "react-redux";

// Import React Router hook for navigation
import { useNavigate } from "react-router-dom";

// ---------------------------- Internal Imports ----------------------------
// Type-only imports for store typing
import type { RootState, AppDispatch } from "../../store/store";

// Import async thunk to logout user
import { logoutUser } from "./logout_slice";

// Import styled button component to separate UI from logic
import LogoutButtonComponent from "./LogoutButtonComponent";

// ---------------------------- Typed Selector Hook ----------------------------
// Create typed useSelector hook for TypeScript support
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ---------------------------- LogoutButton Container ----------------------------
/**
 * LogoutButton
 * ----------------------------
 * Container component connecting Redux state and handlers to UI
 * 
 * Input: None (no props)
 * Process:
 *   1. Extract loading, error, and successMessage from Redux logout slice
 *   2. Define handleLogout function to dispatch logoutUser thunk
 *   3. Monitor successMessage via useEffect for navigation
 *   4. Render LogoutButtonComponent with Redux state and handlers
 * Output: JSX.Element representing logout button with connected functionality
 */
const LogoutButton: React.FC = () => {
    // ---------------------------- Redux Hooks ----------------------------
    // Step 1: Typed dispatch function
    const dispatch = useDispatch<AppDispatch>();

    // Step 2: Extract loading, error, successMessage from logout slice
    const { loading, error, successMessage } = useAppSelector(
        (state) => state.logout
    );

    // ---------------------------- Router Hook ----------------------------
    // Step 3: Hook to navigate programmatically
    const navigate = useNavigate();

    // ---------------------------- Event Handlers ----------------------------
    /**
     * handleLogout
     * ----------------------------
     * Input: None
     * Process:
     *   1. Dispatch logoutUser async thunk to initiate logout
     * Output: Redux action dispatched, API call initiated
     */
    const handleLogout = () => {
        dispatch(logoutUser()); // Step 1: Dispatch logout thunk
    };

    // ---------------------------- Side Effects ----------------------------
    /**
     * Redirect on successful logout
     * ----------------------------
     * Process:
     *   1. Check if successMessage is truthy
     *   2. Navigate to login page
     * Output: User redirected to login page
     */
    useEffect(() => {
        if (successMessage) {
            navigate("/login"); // Step 1: Navigate to login page
        }
    }, [successMessage, navigate]);

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render LogoutButtonComponent with loading state
     *   2. Pass error message for display
     *   3. Pass success message for display
     *   4. Pass handleLogout as onLogout callback
     * Output: JSX.Element
     */
    return (
        <LogoutButtonComponent
            loading={loading}               // Step 1: Pass loading state
            error={error}                   // Step 2: Pass error message
            successMessage={successMessage} // Step 3: Pass success message
            onLogout={handleLogout}         // Step 4: Pass logout handler
        />
    );
};

// ---------------------------- Export ----------------------------
// Export LogoutButton container component for use in parent components
export default LogoutButton;