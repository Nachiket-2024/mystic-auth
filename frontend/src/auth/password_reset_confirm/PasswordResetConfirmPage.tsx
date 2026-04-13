// ---------------------------- External Imports ----------------------------
// React core for component creation
import React from "react";

// Import Chakra UI components for layout and styling
import { Flex, Stack, Heading, Text, StackSeparator } from "@chakra-ui/react";

// Import Link and useSearchParams for navigation and URL query parameters
import { Link, useSearchParams } from "react-router-dom";

// ---------------------------- Internal Imports ----------------------------
// Import the Redux-connected form component for confirming password reset
import PasswordResetConfirmForm from "./PasswordResetConfirmForm";

// ---------------------------- PasswordResetConfirmPage Component ----------------------------
/**
 * PasswordResetConfirmPage
 * ----------------------------
 * Page component that wraps and displays the password reset confirmation form
 * 
 * Input: None (no props)
 * Process:
 *   1. Extract token from URL query parameter (?token=xyz)
 *   2. Render centered Flex container
 *   3. Render Stack as card with white background, padding, and shadow
 *   4. Render page heading
 *   5. Render conditional description text based on token presence
 *   6. Render PasswordResetConfirmForm component with token prop
 *   7. Render back to login link
 * Output: JSX.Element representing the password reset confirmation page with Chakra UI styling
 */
const PasswordResetConfirmPage: React.FC = () => {
    // ---------------------------- URL Parameter Extraction ----------------------------
    /**
     * Extract token from query parameter
     * ----------------------------
     * Process:
     *   1. Use useSearchParams to read URL query string
     *   2. Extract token parameter (e.g., ?token=abc123)
     *   3. Provide empty string fallback if token not present
     * Output: Token string for password reset
     */
    const [searchParams] = useSearchParams();           // Step 1: Read URL query parameters
    const token = searchParams.get("token") || "";      // Step 2: Extract token from query param

    // Determine if token came from URL (clicked email link)
    const hasTokenFromUrl = !!token;

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Flex container to center content horizontally
     *   2. Render Stack as card container with styling
     *   3. Render Reset Password heading
     *   4. Render conditional description text:
     *       - If token from URL: "Enter your new password below"
     *       - If no token: "Enter the token from your email and your new password below"
     *   5. Render password reset confirmation form with token
     *   6. Render back to login link
     * Output: JSX.Element
     */
    return (
        <Flex justify="center">
            <Stack
                w="450px"
                maxW="md"
                align="center"
                bg="white"
                p={10}
                borderRadius="lg"
                boxShadow="lg"
                textAlign="center"
                separator={<StackSeparator />}
            >
                {/* Step 1: Page heading */}
                <Heading size="xl" color="teal.600">
                    Reset Password
                </Heading>

                {/* Step 2: Conditional description text */}
                {hasTokenFromUrl ? (
                    <Text fontSize="md" color="gray.600">
                        Enter your new password below.
                    </Text>
                ) : (
                    <Text fontSize="md" color="gray.600">
                        Enter the token from your email and your new password below.
                    </Text>
                )}

                {/* Step 3: Password reset confirmation form with token prop */}
                <PasswordResetConfirmForm token={token} />

                {/* Step 4: Back to login link */}
                <Text fontSize="16px" color="gray.600">
                    Remember your password?{" "}
                    <Link to="/login" style={{ color: "#319795", fontWeight: 600 }}>
                        Back to Login
                    </Link>
                </Text>
            </Stack>
        </Flex>
    );
};

// ---------------------------- Export ----------------------------
// Export PasswordResetConfirmPage component for use in routing
export default PasswordResetConfirmPage;