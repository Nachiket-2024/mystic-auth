// ---------------------------- External Imports ----------------------------
// Import React for component rendering
import React from "react";

// Import React Router hooks for handling URL parameters and navigation
import { useSearchParams, useNavigate } from "react-router-dom";

// Import Chakra UI components for layout and visual design
import { Box, Text, VStack, Container } from "@chakra-ui/react";

// ---------------------------- Internal Imports ----------------------------
// Import the VerifyAccountButton component
import VerifyAccountButton from "./VerifyAccountButton";

// ---------------------------- VerifyAccountPage Component ----------------------------
/**
 * VerifyAccountPage
 * ----------------------------
 * Displays a Chakra-styled card layout containing the VerifyAccountButton component
 * 
 * Input: None (no props)
 * Process:
 *   1. Extract token and email from URL query parameters
 *   2. Define handleSuccessRedirect to navigate to login page after success
 *   3. Render centered card with heading, description, and verification button
 * Output: JSX.Element representing the account verification page
 */
const VerifyAccountPage: React.FC = () => {

    // ---------------------------- Hooks ----------------------------
    /**
     * URL Parameter Extraction
     * ----------------------------
     * Process:
     *   1. Read URL query parameters using useSearchParams
     *   2. Setup navigation function for programmatic redirect
     *   3. Extract token and email with fallback to empty strings
     * Output: Token and email values, navigation method
     */
    const [searchParams] = useSearchParams();  // Step 1: Read URL query parameters
    const navigate = useNavigate();            // Step 2: Setup router navigation

    // Step 3: Extract token and email with fallback to empty strings
    const token = searchParams.get("token") || "";
    const email = searchParams.get("email") || "";

    // ---------------------------- Event Handlers ----------------------------
    /**
     * handleSuccessRedirect
     * ----------------------------
     * Input: None
     * Process:
     *   1. Redirect user to login page upon successful verification
     *   2. Replace current history entry to prevent back navigation to verification page
     * Output: User navigated to login screen
     */
    const handleSuccessRedirect = () => {
        navigate("/login", { replace: true }); // Step 1: Redirect to login with replace
    };

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Container with maximum width for responsive layout
     *   2. Render Box as outer card container with border and shadow
     *   3. Render page heading with teal color
     *   4. Render instructional text for user guidance
     *   5. Render VerifyAccountButton with token, email, and success callback
     * Output: Fully responsive, teal-themed verification page
     */
    return (
        <Container
            maxW="lg"
        >
            {/* Step 1: Outer Card Container */}
            <Box
                w="full"
                p={8}
                borderWidth="1px"
                borderRadius="lg"
                boxShadow="lg"
                textAlign="center"
            >
                {/* Step 2: Page Heading */}
                <Text
                    fontSize="2xl"
                    fontWeight="bold"
                    color="teal.600"
                    mb={6}
                >
                    Verify Your Account
                </Text>

                {/* Step 3: Instructional Text */}
                <Text fontSize="md" color="gray.600" mb={6}>
                    Click the button below to verify your account and activate access.
                </Text>

                {/* Step 4: Verification Button Block */}
                <VStack>
                    <VerifyAccountButton
                        token={token}
                        email={email}
                        onSuccess={handleSuccessRedirect}
                    />
                </VStack>
            </Box>
        </Container>
    );
};

// ---------------------------- Export ----------------------------
// Export page component for routing integration
export default VerifyAccountPage;