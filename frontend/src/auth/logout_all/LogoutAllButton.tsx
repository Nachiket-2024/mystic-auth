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

// Import async thunk and action to clear logout-all state
import { logoutAllDevices, clearLogoutAllState } from "./logout_all_slice";

// Import presentational button component
import LogoutAllButtonComponent from "./LogoutAllButtonComponent";

// ---------------------------- Typed Selector Hook ----------------------------
// Create typed useSelector hook for TypeScript support
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ---------------------------- LogoutAllButton Container ----------------------------
/**
 * LogoutAllButton
 * ----------------------------
 * Container component connecting Redux state and handlers to UI for logout from all devices
 * 
 * Input: None (no props)
 * Process:
 *   1. Extract loading, error, and successMessage from Redux logoutAll slice
 *   2. Define handleLogoutAll function to dispatch logoutAllDevices thunk
 *   3. Monitor successMessage via useEffect for navigation
 *   4. Clear logoutAll state after successful redirect
 *   5. Render LogoutAllButtonComponent with Redux state and handlers
 * Output: JSX.Element representing logout all button with connected functionality
 */
const LogoutAllButton: React.FC = () => {
    // ---------------------------- Redux Hooks ----------------------------
    // Step 1: Typed dispatch function
    const dispatch = useDispatch<AppDispatch>();

    // Step 2: Extract loading, error, successMessage from logoutAll slice
    const { loading, error, successMessage } = useAppSelector(
        (state) => state.logoutAll
    );

    // ---------------------------- Router Hook ----------------------------
    // Step 3: Hook to navigate programmatically
    const navigate = useNavigate();

    // ---------------------------- Event Handlers ----------------------------
    /**
     * handleLogoutAll
     * ----------------------------
     * Input: None
     * Process:
     *   1. Dispatch logoutAllDevices async thunk to initiate logout from all devices
     * Output: Redux action dispatched, API call initiated
     */
    const handleLogoutAll = () => {
        dispatch(logoutAllDevices()); // Step 1: Dispatch logout-all thunk
    };

    // ---------------------------- Side Effects ----------------------------
    /**
     * Redirect on successful logout all
     * ----------------------------
     * Process:
     *   1. Check if successMessage is truthy
     *   2. Navigate to login page
     *   3. Dispatch clearLogoutAllState to reset Redux state
     * Output: User redirected to login page, Redux state cleared
     */
    useEffect(() => {
        if (successMessage) {
            navigate("/login");                  // Step 1: Navigate to login page
            dispatch(clearLogoutAllState());     // Step 2: Reset state after redirect
        }
    }, [successMessage, navigate, dispatch]);

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render LogoutAllButtonComponent with loading state
     *   2. Pass error message for display
     *   3. Pass success message for display
     *   4. Pass handleLogoutAll as onLogoutAll callback
     * Output: JSX.Element
     */
    return (
        <LogoutAllButtonComponent
            loading={loading}               // Step 1: Pass loading state
            error={error}                   // Step 2: Pass error message
            successMessage={successMessage} // Step 3: Pass success message
            onLogoutAll={handleLogoutAll}   // Step 4: Pass logout-all handler
        />
    );
};

// ---------------------------- Export ----------------------------
// Export LogoutAllButton container component for use in parent components
export default LogoutAllButton;