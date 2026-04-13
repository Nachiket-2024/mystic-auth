// ---------------------------- External Imports ----------------------------
// Import React core for JSX/TSX syntax
import React from "react";

// Import Chakra UI components for layout and styling
import { Button, Text, Stack } from "@chakra-ui/react";

// ---------------------------- Props Interface Definition ----------------------------
/**
 * LogoutButtonComponentProps
 * ----------------------------
 * Defines the props accepted by the LogoutButtonComponent
 * Fields:
 *   1. loading - True if logout request is in progress
 *   2. error - Stores error message if logout fails
 *   3. successMessage - Stores success message after logout succeeds
 *   4. onLogout - Function to trigger logout action
 */
interface LogoutButtonComponentProps {
    loading: boolean;           // Step 1: Request in progress flag
    error: string | null;       // Step 2: Error message storage
    successMessage: string | null; // Step 3: Success message storage
    onLogout: () => void;       // Step 4: Logout trigger function
}

// ---------------------------- LogoutButtonComponent ----------------------------
/**
 * LogoutButtonComponent
 * ----------------------------
 * High-level presentational component responsible for:
 *   1. Rendering Chakra-styled logout button
 *   2. Handling loading state display
 *   3. Displaying success or error messages
 * 
 * Input: LogoutButtonComponentProps (loading, error, successMessage, onLogout)
 * Process:
 *   1. Render Stack container with centered alignment
 *   2. Render Button with onLogout handler and loading text
 *   3. Conditionally render error message if present
 *   4. Conditionally render success message if present
 * Output: JSX.Element representing logout button with status messages
 */
const LogoutButtonComponent: React.FC<LogoutButtonComponentProps> = ({
    error,
    successMessage,
    onLogout,
}) => {
    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Stack container for vertical layout
     *   2. Render logout button with red color scheme
     *   3. Display error message when logout fails
     *   4. Display success message when logout succeeds
     * Output: JSX.Element
     */
    return (
        <Stack
            align="center"       // Step 1: Center-align button and messages
        >
            {/* Step 2: Logout button styled with Chakra UI */}
            <Button
                onClick={onLogout}                         // Trigger logout handler
                loadingText="Logging out..."               // Text while loading
                bg="red.600"                               // Red background for danger action
                _hover={{ bg: "red.700" }}                 // Darker red on hover
                color="white"                              // White text color
                size="lg"                                  // Large button for emphasis
                w="160px"                                  // Fixed width
                h="40px"                                   // Fixed height
            >
                Logout
            </Button>

            {/* Step 3: Display error message if present */}
            {error && (
                <Text color="red.500" fontSize="md">
                    {error}
                </Text>
            )}

            {/* Step 4: Display success message if present */}
            {successMessage && (
                <Text color="green.500" fontSize="md">
                    {successMessage}
                </Text>
            )}
        </Stack>
    );
};

// ---------------------------- Export ----------------------------
// Export LogoutButtonComponent for reuse in parent components
export default LogoutButtonComponent;