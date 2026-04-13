// ---------------------------- External Imports ----------------------------
// Import React for component creation and JSX support
import React from "react";

// Import Navigate for conditional redirection based on authentication
import { Navigate } from "react-router-dom";

// Import Redux hook for reading authentication state
import { useSelector } from "react-redux";

// ---------------------------- Internal Imports ----------------------------
// Import RootState type for typed Redux selector
import type { RootState } from "../store/store";

// ---------------------------- Props Interface Definition ----------------------------
/**
 * ProtectedRouteProps
 * ----------------------------
 * Defines the props accepted by the ProtectedRoute component
 * Fields:
 *   1. children - Component or components to render if user is authenticated
 */
interface ProtectedRouteProps {
    children: React.ReactNode; // Step 1: Protected content to render when authenticated
}

// ---------------------------- ProtectedRoute Component ----------------------------
/**
 * ProtectedRoute
 * ----------------------------
 * Ensures that child components are only accessible to authenticated users
 * Redirects unauthenticated users to the login page and shows a loader while session is being verified
 * 
 * Input: ProtectedRouteProps containing children components
 * Process:
 *   1. Extract authentication status and loading state from Redux currentUser slice
 *   2. Show loader if authentication status is unknown or still loading
 *   3. Redirect to login page if user is explicitly unauthenticated
 *   4. Render protected children if user is authenticated
 * Output: JSX.Element representing loader, redirect, or protected content
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {

    // ---------------------------- Redux State Selection ----------------------------
    /**
     * Authentication State Extraction
     * ----------------------------
     * Process:
     *   1. Extract isAuthenticated flag and loading state from currentUser Redux slice
     * Output: Authentication status and loading indicator
     */
    const { isAuthenticated, loading } = useSelector(
        (state: RootState) => state.currentUser  // Step 1: Select currentUser slice
    );

    // ---------------------------- Render Logic ----------------------------
    /**
     * renderProtectedContent
     * ----------------------------
     * Determines what to render based on authentication state
     * 
     * Process:
     *   1. Show loading indicator if auth check is in progress or status unknown
     *   2. Redirect to login page if user is explicitly unauthenticated
     *   3. Render protected children if user is authenticated
     * Output: JSX element representing route access decision
     */
    const renderProtectedContent = () => {
        // Step 1: Show loader if authentication status is unknown or still loading
        if (loading || isAuthenticated === null) {
            return (
                <div className="flex items-center justify-center h-screen bg-gray-100">
                    <p className="text-lg text-gray-600">Verifying session...</p>
                </div>
            );
        }

        // Step 2: Redirect unauthenticated users to login page with replace
        if (isAuthenticated === false) {
            return <Navigate to="/login" replace />;
        }

        // Step 3: Render protected children for authenticated users
        return <>{children}</>;
    };

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Execute renderProtectedContent to determine appropriate output
     * Output: JSX element of loader, redirect, or protected content
     */
    return renderProtectedContent();
};

// ---------------------------- Export ----------------------------
// Export component to wrap protected routes in the application
export default ProtectedRoute;