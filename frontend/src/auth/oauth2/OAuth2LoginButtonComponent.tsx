// ---------------------------- External Imports ----------------------------
// Import React for JSX/TSX syntax and functional components
import React from "react";

// Import Chakra UI components for Button and Flexbox layout
import { Button, Flex } from "@chakra-ui/react";

// ---------------------------- Props Interface Definition ----------------------------
/**
 * OAuth2LoginButtonComponentProps
 * ----------------------------
 * Defines the props accepted by the OAuth2LoginButtonComponent presentational component
 * Fields:
 *   1. error - OAuth2 login error message, if any
 *   2. isAuthenticated - OAuth2 authentication status
 *   3. user - Object containing user information (id, email, role) or null
 *   4. globalAuth - Global authentication status from currentUser slice
 *   5. onLogin - Callback function to trigger login redirect
 */
interface OAuth2LoginButtonComponentProps {
    error: string | null;                                       // Step 1: Error message
    isAuthenticated: boolean;                                   // Step 2: OAuth2 auth state
    user: { id: string; email: string; role: string } | null;   // Step 3: User information
    globalAuth: boolean;                                        // Step 4: Global auth state
    onLogin: () => void;                                        // Step 5: Login handler
}

// ---------------------------- OAuth2LoginButtonComponent ----------------------------
/**
 * OAuth2LoginButtonComponent
 * ----------------------------
 * Presentational component for Google OAuth2 login
 * Responsibilities:
 *   1. Renders a full-width login button with Google G icon
 *   2. Shows error messages if login fails
 *   3. Displays welcome message if authenticated
 * 
 * Input: OAuth2LoginButtonComponentProps (error, isAuthenticated, user, globalAuth, onLogin)
 * Process:
 *   1. Render container div with top margin spacing
 *   2. Render Google OAuth2 login button with icon and label
 *   3. Conditionally render error message if present
 *   4. Conditionally render welcome message if authenticated and user exists
 * Output: JSX.Element representing Google OAuth2 login button with status messages
 */
const OAuth2LoginButtonComponent: React.FC<OAuth2LoginButtonComponentProps> = ({
    error,
    isAuthenticated,
    user,
    globalAuth,
    onLogin,
}) => {
    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render container div for spacing
     *   2. Render Google OAuth2 button with full width and white background
     *   3. Display Google G icon and Sign in with Google text
     *   4. Display error message when login fails
     *   5. Display welcome message when authenticated and user data exists
     * Output: JSX.Element
     */
    return (
        <div style={{ width: "100%", marginTop: "1rem" }}> {/* Step 1: Container with top spacing */}

            {/* Step 2: Google OAuth2 login button */}
            <Button
                w="full"                               // Full width
                bg="white"                             // White background
                color="gray.800"                       // Dark gray text color
                border="1px solid #ddd"                // Light gray border
                _hover={{ bg: "#e0e0e0" }}             // Hover effect - slightly darker gray
                size="lg"                              // Large button size
                onClick={onLogin}                      // Step 3: Trigger login callback on click
            >
                {/* Step 4: Flex container for icon and text alignment */}
                <Flex align="center" justify="center" gap={2}>
                    {/* Step 5: Google G SVG icon */}
                    <svg width="20" height="20" viewBox="0 0 533.5 544.3">
                        <path fill="#4285F4" d="M533.5 278.4c0-17.5-1.5-34.4-4.3-50.7H272v95.9h146.9c-6.3 33.9-25.5 62.7-54.5 82v68h87.8c51.4-47.4 80.3-116.9 80.3-195.2z"/>
                        <path fill="#34A853" d="M272 544.3c73.7 0 135.5-24.3 180.7-66.2l-87.8-68c-24.4 16.4-55.7 26-92.9 26-71.5 0-132.2-48.1-153.9-112.7h-90.6v70.8c45.3 90 138.5 150.1 244.5 150.1z"/>
                        <path fill="#FBBC05" d="M118.3 323.2c-10.7-32-10.7-66.6 0-98.6v-70.8h-90.6c-40.2 78.7-40.2 171.1 0 249.8l90.6-70.4z"/>
                        <path fill="#EA4335" d="M272 107.7c39.8-.6 77.7 14 106.6 40.8l79.9-79.9C405.9 21 345.7-4.3 272 0 166 0 72.8 60.1 27.5 150.1l90.6 70.8C139.8 155.8 200.5 107.7 272 107.7z"/>
                    </svg>
                    <span>Sign in with Google</span> {/* Step 6: Button label */}
                </Flex>
            </Button>

            {/* Step 7: Display error message if login fails */}
            {error && <p style={{ color: "red", marginTop: "0.5rem" }}>{error}</p>}

            {/* Step 8: Display welcome message if authenticated and user data exists */}
            {(isAuthenticated || globalAuth) && user && (
                <p style={{ color: "green", marginTop: "0.5rem" }}>
                    Welcome, {user.email}! (role: {user.role})
                </p>
            )}
        </div>
    );
};

// ---------------------------- Export ----------------------------
// Export presentational component for container usage
export default OAuth2LoginButtonComponent;