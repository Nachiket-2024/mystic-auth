// ---------------------------- External Imports ----------------------------
// Import React for component creation and JSX support
import React from "react";

// Import Navigate for conditional redirection based on authentication
import { Navigate } from "react-router-dom";

// Import Redux hook for reading authentication state
import { useSelector } from "react-redux";

// Import Chakra UI components for consistent loading screen
import { Flex, Spinner, Text } from "@chakra-ui/react";

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

// ---------------------------- LoadingScreen Component ----------------------------
/**
 * LoadingScreen
 * ----------------------------
 * Consistent loading screen component matching App.tsx style
 * Prevents flash of unstyled text by using Chakra UI components
 * 
 * Input: None (no props)
 * Process:
 *   1. Render Flex container centered vertically and horizontally
 *   2. Display Spinner for loading animation
 *   3. Display loading text with Chakra Text component
 * Output: JSX.Element showing loading state
 */
const LoadingScreen: React.FC = () => {
    const bg = "#f0f0f0"; // Background for loading screen matching App.tsx
    
    return (
        // Step 1: Flex container for centering
        <Flex align="center" justify="center" h="100vh" bg={bg}>
            {/* Step 2: Loading spinner with consistent color */}
            <Spinner size="xl" color="#3182ce" />

            {/* Step 3: Loading text with Chakra UI - no flash of unstyled content */}
            <Text ml={4} fontSize="lg" color="#4a5568">Verifying session...</Text>
        </Flex>
    );
};

// ---------------------------- ProtectedRoute Component ----------------------------
/**
 * ProtectedRoute
 * ----------------------------
 * Ensures that child components are only accessible to authenticated users
 * Redirects unauthenticated users to the login page and shows a loader while session is being verified
 * 
 * Input: ProtectedRouteProps containing children components
 * Process:
 *   1. Extract authentication status from Redux currentUser slice
 *   2. Show loader ONLY if authentication status is unknown (null)
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
     *   1. Extract isAuthenticated flag from currentUser Redux slice
     * Output: Authentication status only
     */
    const { isAuthenticated } = useSelector(
        (state: RootState) => state.currentUser  // Step 1: Select currentUser slice
    );

    // ---------------------------- Render Logic ----------------------------
    /**
     * renderProtectedContent
     * ----------------------------
     * Determines what to render based on authentication state
     * 
     * Process:
     *   1. Show loading indicator ONLY if auth status is unknown (null)
     *   2. Redirect to login page if user is explicitly unauthenticated
     *   3. Render protected children if user is authenticated
     * Output: JSX element representing route access decision
     */
    const renderProtectedContent = () => {
        // Step 1: Show loader ONLY when authentication status is truly unknown
        if (isAuthenticated === null) {
            return <LoadingScreen />;
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