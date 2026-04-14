// ---------------------------- External Imports ----------------------------
// Import React for JSX, hooks (state and effect)
import React, { useEffect, useState } from "react";

// Import React Router hooks/components for navigation and redirection
import { useNavigate, Link, Navigate } from "react-router-dom";

// Import Redux hooks for selecting state and dispatching actions
import { useSelector, useDispatch } from "react-redux";

// Import Chakra UI components for layout, text, stack, separators, flexbox, and spinner
import { Stack, Heading, Text, StackSeparator, Flex, Spinner } from "@chakra-ui/react";

// ---------------------------- Internal Imports ----------------------------
// Import LoginForm component for standard username and password login
import LoginForm from "./LoginForm";

// Import OAuth2Button component for Google OAuth2 login
import OAuth2Button from "../oauth2/OAuth2LoginButton";

// Import TypeScript types for Redux store state and dispatch
import type { RootState, AppDispatch } from "../../store/store";

// Import action to clear stale OAuth2 user session
import { clearUserSession } from "../oauth2/oauth2_slice";

// ---------------------------- LoadingSpinner Component ----------------------------
/**
 * LoadingSpinner
 * ----------------------------
 * Consistent loading spinner component matching app theme
 * Prevents "Loading..." text flash by using Chakra UI Spinner
 * 
 * Input: None (no props)
 * Process:
 *   1. Render centered Flex container
 *   2. Display Spinner with proper sizing
 *   3. Show loading text next to spinner
 * Output: JSX.Element showing styled loading state
 */
const LoadingSpinner: React.FC = () => {
    return (
        <Flex justify="center" align="center" minH="400px">
            <Spinner size="xl" color="teal.500" />
            <Text ml={4} fontSize="lg" color="gray.600">Signing you in...</Text>
        </Flex>
    );
};

// ---------------------------- LoginPage Component ----------------------------
/**
 * LoginPage
 * ----------------------------
 * Renders a user login page with:
 *   1. Standard LoginForm for email and password authentication
 *   2. OAuth2 login button (Google)
 *   3. Redirect logic for already authenticated users
 *   4. Error handling and login attempt tracking
 * 
 * Input: None (no props)
 * Process:
 *   1. Clear any previous OAuth2 session on mount
 *   2. Track login attempts to conditionally show errors
 *   3. Redirect to dashboard if already authenticated
 *   4. Render login form and OAuth2 button
 * Output: JSX.Element representing the login page
 */
const LoginPage: React.FC = () => {
    // ---------------------------- Hooks ----------------------------
    const navigate = useNavigate();                               // Step 1: Navigation hook
    const dispatch = useDispatch<AppDispatch>();                 // Step 2: Typed dispatch hook
    const { isAuthenticated, loading, error } = useSelector(     // Step 3: Redux state selection
        (state: RootState) => state.oauth2
    );
    const [loginAttempted, setLoginAttempted] = useState(false); // Step 4: Login attempt tracker

    // ---------------------------- Effects ----------------------------
    /**
     * Clear OAuth2 session on page mount
     * ----------------------------
     * Process:
     *   1. Dispatch clearUserSession to remove stale OAuth2 state
     *   2. Reset loginAttempted flag to false
     * Output: Clean Redux state for fresh login attempt
     */
    useEffect(() => {
        dispatch(clearUserSession());  // Step 1: Clear stale session
        setLoginAttempted(false);      // Step 2: Reset login attempt tracker
    }, [dispatch]);

    // ---------------------------- Conditional Returns ----------------------------
    /**
     * Loading State Check
     * ----------------------------
     * Returns centered spinner with proper styling matching app theme
     */
    // Step 1: Show loading spinner if login process is in progress (no text flash)
    if (loading) return <LoadingSpinner />;

    // Step 2: Redirect to dashboard if already authenticated
    if (isAuthenticated) return <Navigate to="/dashboard" replace />;

    // ---------------------------- Callback Definitions ----------------------------
    /**
     * handleLoginSuccess
     * ----------------------------
     * Input: None
     * Process:
     *   1. Reset loginAttempted state to false
     *   2. Navigate to dashboard page with replace option
     * Output: void
     */
    const handleLoginSuccess = () => {
        setLoginAttempted(false);                       // Step 1: Reset tracker
        navigate("/dashboard", { replace: true });      // Step 2: Redirect to dashboard
    };

    /**
     * handleLoginAttempt
     * ----------------------------
     * Input: None
     * Process:
     *   1. Set loginAttempted state to true
     * Output: void
     */
    const handleLoginAttempt = () => setLoginAttempted(true); // Step 1: Track login attempt

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Wrap content in a centered Flex container
     *   2. Use a Stack as the main card with padding, background, shadow, and separator
     *   3. Display heading and description text
     *   4. Show error message if login failed and was attempted
     *   5. Render LoginForm with success and attempt callbacks
     *   6. Render OAuth2Button with success and attempt callbacks
     *   7. Show signup link for new users
     * Output: JSX.Element representing the login page
     */
    return (
        <Flex justify="center">                                      {/* Step 1: Center container */}
            <Stack
                w="450px"                                                      /* Width */
                maxW="md"                                                      /* Max width medium */
                align="center"                                                 /* Center align items */
                bg="white"                                                     /* Card background color */
                p={10}                                                         /* Padding */
                borderRadius="lg"                                              /* Rounded corners */
                boxShadow="lg"                                                 /* Card shadow */
                textAlign="center"                                             /* Center text */
                separator={<StackSeparator />}                                 /* Stack separator */
            >
                {/* Step 3: Heading and description */}
                <Heading size="2xl" color="teal.600">Welcome</Heading>
                <Text fontSize="md" color="gray.600">
                    Sign in to continue to your dashboard
                </Text>

                {/* Step 4: Error message display on failed login attempt */}
                {error && loginAttempted && (
                    <Text color="red.500" fontWeight="bold">{error}</Text>
                )}

                {/* Step 5: Standard login form component */}
                <LoginForm
                    onSuccess={handleLoginSuccess}
                    onAttempt={handleLoginAttempt}
                />

                {/* Step 6: OAuth2 login button component */}
                <OAuth2Button
                    onSuccess={handleLoginSuccess}
                    onAttempt={handleLoginAttempt}
                />

                {/* Step 7: Signup link for new users */}
                <Text fontSize="16px" color="gray.600">
                    Don't have an account?{" "}
                    <Link to="/signup" style={{ color: "#319795", fontWeight: 600 }}>
                        Sign Up
                    </Link>
                </Text>
            </Stack>
        </Flex>
    );
};

// ---------------------------- Export ----------------------------
// Export LoginPage as default component for routing
export default LoginPage;