// ---------------------------- External Imports ----------------------------
// Import React for JSX/TSX and functional components
import React from "react";

// Import Chakra UI components for layout and styling
import { Flex, Stack, Heading } from "@chakra-ui/react";

// ---------------------------- Internal Imports ----------------------------
// Import the SignupForm component
import SignupForm from "./SignupForm";

// ---------------------------- SignupPage Component ----------------------------
/**
 * SignupPage
 * ----------------------------
 * Chakra UI-based signup page component
 * 
 * Input: None (no props)
 * Process:
 *   1. Center the signup card using Flex layout
 *   2. Use Stack as a card container with padding, rounded corners, and shadow
 *   3. Display Sign Up heading
 *   4. Render SignupForm component inside the card
 * Output: JSX.Element representing the styled signup page
 */
const SignupPage: React.FC = () => {

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Flex container to center the card horizontally
     *   2. Render Stack as card container with white background and shadow
     *   3. Render Sign Up heading with teal color
     *   4. Render SignupForm component
     * Output: JSX.Element
     */
    return (
        // Step 1: Flex container to center the card horizontally
        <Flex
            justify="center"     // Horizontal center alignment
        >
            {/* Step 2: Card container with styling */}
            <Stack
                w="1000px"               // Fixed width
                maxW="800px"             // Maximum width constraint
                bg="white"               // White background
                p={10}                   // Inner padding
                borderRadius="lg"        // Rounded corners
                boxShadow="lg"           // Shadow for elevation
                textAlign="center"       // Center aligned text
            >
                {/* Step 3: Page heading */}
                <Heading fontSize="25px" color="teal.600">
                    Sign Up
                </Heading>

                {/* Step 4: Signup form component */}
                <SignupForm />
            </Stack>
        </Flex>
    );
};

// ---------------------------- Export ----------------------------
// Export the component as default for routing or parent layout
export default SignupPage;