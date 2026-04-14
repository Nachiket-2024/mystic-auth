// ---------------------------- External Imports ----------------------------
// Import React to use JSX/TSX syntax in component
import React, { useEffect } from "react";

// Import BrowserRouter, Routes, and Route for routing
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// Import Redux hooks for state and dispatch access
import { useDispatch, useSelector } from "react-redux";

// Import Chakra UI components for layout, typography, buttons, and stacks
import { Box, Flex, Heading, Text, Spinner, VStack, Button } from "@chakra-ui/react";
import type { StackProps } from "@chakra-ui/react"; // Type import for stack props

// ---------------------------- Internal Imports ----------------------------
// Import authentication pages
import LoginPage from "./auth/login/LoginPage";
import SignupPage from "./auth/signup/SignupPage";
import VerifyAccountPage from "./auth/verify_account/VerifyAccountPage";
import PasswordResetRequestPage from "./auth/password_reset_request/PasswordResetRequestPage";
import PasswordResetConfirmPage from "./auth/password_reset_confirm/PasswordResetConfirmPage";

// Import dashboard page
import DashboardPage from "./dashboard/DashboardPage";

// Import ProtectedRoute component to guard private pages
import ProtectedRoute from "./auth/ProtectedRoute";

// Import Redux action to fetch current user session
import { fetchCurrentUser } from "./auth/current_user/current_user_slice";

// Import types for Redux state and dispatch
import type { AppDispatch, RootState } from "./store/store";

// ---------------------------- NotFoundPage Component ----------------------------
/**
 * NotFoundPage
 * ----------------------------
 * Functional component for 404 page (route not found)
 * 
 * Input: None (no props)
 * Process:
 *   1. Render Flex container centered vertically and horizontally
 *   2. Render VStack to stack heading, text, and button with spacing
 *   3. Display 404 heading
 *   4. Display Oops! Page Not Found message
 *   5. Render Go Home button to redirect user to dashboard
 * Output: JSX.Element representing 404 page
 */
const NotFoundPage: React.FC = () => {
    const bg = "#f0f0f0";        // Step 1: Background color for 404 page
    const textColor = "#e53e3e"; // Step 2: Text color for 404 heading

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Flex container centered vertically and horizontally
     *   2. Render VStack to stack elements vertically
     *   3. Display 404 heading
     *   4. Display error message text
     *   5. Render Go Home button for navigation
     * Output: JSX.Element
     */
    return (
        // Step 1: Flex container for centering
        <Flex align="center" justify="center" h="100vh" bg={bg} px={4} textAlign="center">
            {/* Step 2: VStack for stacking elements */}
            <VStack {...({ spacing: 4 } as StackProps)}>
                {/* Step 3: 404 heading */}
                <Heading color={textColor} size="2xl">404</Heading>

                {/* Step 4: Error message */}
                <Text fontSize="xl" fontWeight="medium">Oops! Page Not Found</Text>

                {/* Step 5: Go Home button */}
                <Button
                    colorScheme="teal"
                    size="md"
                    fontWeight="bold"
                    _hover={{ bg: "teal.600" }}
                    _active={{ bg: "teal.700" }}
                    onClick={() => window.location.href = "/"}
                >
                    Go Home
                </Button>
            </VStack>
        </Flex>
    );
};

// ---------------------------- LoadingScreen Component ----------------------------
/**
 * LoadingScreen
 * ----------------------------
 * Functional component for consistent loading state display
 * 
 * Input: None (no props)
 * Process:
 *   1. Render Flex container centered vertically and horizontally
 *   2. Display Spinner for loading animation
 *   3. Display Checking session text
 * Output: JSX.Element showing loading state
 */
const LoadingScreen: React.FC = () => {
    const bg = "#f0f0f0"; // Background for loading screen
    
    return (
        // Step 1: Flex container for centering
        <Flex align="center" justify="center" h="100vh" bg={bg}>
            {/* Step 2: Loading spinner */}
            <Spinner size="xl" color="#3182ce" />

            {/* Step 3: Loading text */}
            <Text ml={4} fontSize="lg" color="#4a5568">Checking session...</Text>
        </Flex>
    );
};

// ---------------------------- App Component ----------------------------
/**
 * App
 * ----------------------------
 * Main application component with routing and layout
 * 
 * Input: None (no props)
 * Process:
 *   1. Initialize Redux dispatch and select authentication state
 *   2. Fetch current user session on mount if authentication status is unknown
 *   3. Show loading screen while session is being verified (until we KNOW the auth state)
 *   4. Render Router with header, main content area, and footer
 *   5. Define protected and public routes
 * Output: JSX.Element representing full app layout with routing
 */
const App: React.FC = () => {
    const dispatch: AppDispatch = useDispatch(); // Step 1: Redux dispatch
    const { isAuthenticated } = useSelector(
        (state: RootState) => state.currentUser // Step 2: Select authentication state
    );

    // ---------------------------- Effects ----------------------------
    /**
     * Fetch Current User on Mount
     * ----------------------------
     * Process:
     *   1. Check if authentication status is null (unknown)
     *   2. Dispatch fetchCurrentUser to verify session with backend
     * Output: Redux state updated with authentication status
     */
    useEffect(() => {
        if (isAuthenticated === null) {
            dispatch(fetchCurrentUser("AppUseEffect")); // Step 1: Fetch user session
        }
    }, [dispatch, isAuthenticated]);

    // ---------------------------- Loading State ----------------------------
    /**
     * Loading State Check
     * ----------------------------
     * Process:
     *   1. Check if authentication status is null (unknown)
     *   2. If null, we don't know if user is logged in yet
     *   3. Show loading screen until backend responds with definitive answer
     *   4. This prevents flash of unauthenticated content or layout shift
     * Output: LoadingScreen component or continues to main render
     */
    // Show loading screen while authentication status is being determined
    // We show loading until isAuthenticated is no longer null (meaning we have a definitive answer)
    if (isAuthenticated === null) {
        return <LoadingScreen />; // Step 1: Show consistent loading screen
    }

    const headerBg = "linear-gradient(to right, #4299e1, #38b2ac)"; // Step 1: Header gradient
    const mainBg = "#f0f0f0"; // Step 2: Main content background

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Router wrapper for routing functionality
     *   2. Render Flex container as main column layout
     *   3. Render header with application title
     *   4. Render main content area with Routes
     *   5. Define protected routes (dashboard, home) wrapped in ProtectedRoute
     *   6. Define public routes (login, signup, verify, password reset)
     *   7. Render footer with copyright information
     * Output: JSX.Element representing full app layout with routing
     */
    return (
        // Step 1: Router wrapper
        <Router>
            {/* Step 2: Main Flex layout with column direction */}
            <Flex direction="column" minH="100vh" bg={mainBg}>
                {/* Step 3: Header section */}
                <Box bg={headerBg} py={6} shadow="md">
                    <Heading textAlign="center" color="white" fontSize="3xl">Full Stack Auth Template</Heading>
                </Box>

                {/* Step 4: Main content area */}
                <Flex flex="1" direction="column" py={8}>
                    <Routes>
                        {/* Step 5: Protected Routes - require authentication */}
                        <Route
                            path="/"
                            element={
                                <ProtectedRoute>
                                    <Box maxW="container.lg" mx="auto">
                                        <DashboardPage />
                                    </Box>
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/dashboard"
                            element={
                                <ProtectedRoute>
                                    <Box maxW="container.lg" mx="auto">
                                        <DashboardPage />
                                    </Box>
                                </ProtectedRoute>
                            }
                        />

                        {/* Step 6: Public Routes - accessible without authentication */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<SignupPage />} />
                        <Route path="/verify-account" element={<VerifyAccountPage />} />
                        <Route path="/password-reset-request" element={<PasswordResetRequestPage />} />
                        
                        {/* Step 6a: Password reset confirm route - matches backend email link format */}
                        <Route path="/reset-password" element={<PasswordResetConfirmPage />} />

                        {/* Step 7: 404 Page - catch-all for unmatched routes */}
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </Flex>

                {/* Step 8: Footer section */}
                <Box bg="#73D5E8" py={2.5} mt="auto" textAlign="center">
                    <Text color="#4a5568" fontSize="sm">© 2026 Full Stack Template. All rights reserved.</Text>
                </Box>
            </Flex>
        </Router>
    );
};

// ---------------------------- Export ----------------------------
// Export App component as default for rendering
export default App;