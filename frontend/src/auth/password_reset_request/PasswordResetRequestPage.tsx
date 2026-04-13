// ---------------------------- External Imports ----------------------------
// React core for component creation
import React from "react";

// Import Chakra UI components for layout and styling
import { Flex, Stack, Heading, Text, StackSeparator } from "@chakra-ui/react";

// Import Link for navigation
import { Link } from "react-router-dom";

// ---------------------------- Internal Imports ----------------------------
// Import the Redux-connected form component for requesting a password reset
import PasswordResetRequestForm from "./PasswordResetRequestForm";

// ---------------------------- PasswordResetRequestPage Component ----------------------------
/**
 * PasswordResetRequestPage
 * ----------------------------
 * Page component that wraps and displays the password reset request form
 * 
 * Input: None (no props)
 * Process:
 *   1. Render centered Flex container
 *   2. Render Stack as card with white background, padding, and shadow
 *   3. Render page heading
 *   4. Render description text
 *   5. Render PasswordResetRequestForm component
 *   6. Render back to login link
 * Output: JSX.Element representing the password reset request page with Chakra UI styling
 */
const PasswordResetRequestPage: React.FC = () => {
    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Flex container to center content horizontally
     *   2. Render Stack as card container with styling
     *   3. Render Forgot Password? heading
     *   4. Render description text
     *   5. Render password reset request form
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
                    Forgot Password?
                </Heading>

                {/* Step 2: Description text */}
                <Text fontSize="md" color="gray.600">
                    Enter your email address and we'll send you a link to reset your password.
                </Text>

                {/* Step 3: Password reset request form */}
                <PasswordResetRequestForm />

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
// Export PasswordResetRequestPage component for use in routing
export default PasswordResetRequestPage;