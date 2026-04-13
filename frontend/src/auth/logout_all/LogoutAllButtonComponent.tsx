// ---------------------------- External Imports ----------------------------
// Import React core for JSX/TSX syntax
import React from "react";

// Import Chakra UI components for layout and styling
import { Button, Text, Stack } from "@chakra-ui/react";

// ---------------------------- Props Interface Definition ----------------------------
/**
 * LogoutAllButtonComponentProps
 * ----------------------------
 * Defines the props accepted by the LogoutAllButtonComponent
 * Fields:
 *   1. loading - True if logout-all request is in progress
 *   2. error - Stores error message if logout-all fails
 *   3. successMessage - Stores success message after logout-all succeeds
 *   4. onLogoutAll - Function to trigger logout-all action
 */
interface LogoutAllButtonComponentProps {
    loading: boolean;              // Step 1: Request in progress flag
    error: string | null;          // Step 2: Error message storage
    successMessage: string | null; // Step 3: Success message storage
    onLogoutAll: () => void;       // Step 4: Logout-all trigger function
}

// ---------------------------- LogoutAllButtonComponent ----------------------------
/**
 * LogoutAllButtonComponent
 * ----------------------------
 * High-level presentational component responsible for:
 *   1. Rendering Chakra-styled Logout All Devices button
 *   2. Handling loading state display
 *   3. Displaying success or error messages
 * 
 * Input: LogoutAllButtonComponentProps (loading, error, successMessage, onLogoutAll)
 * Process:
 *   1. Render Stack container with centered alignment
 *   2. Render Button with onLogoutAll handler and loading text
 *   3. Conditionally render error message if present
 *   4. Conditionally render success message if present
 * Output: JSX.Element representing logout all button with status messages
 */
const LogoutAllButtonComponent: React.FC<LogoutAllButtonComponentProps> = ({
    error,
    successMessage,
    onLogoutAll,
}) => {
    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Stack container for vertical layout
     *   2. Render logout all button with red color scheme
     *   3. Display error message when logout all fails
     *   4. Display success message when logout all succeeds
     * Output: JSX.Element
     */
    return (
        <Stack
            align="center"      // Step 1: Center-align button and messages
        >
            {/* Step 2: Logout all devices button styled with Chakra UI */}
            <Button
                onClick={onLogoutAll}                     // Trigger logout-all handler
                loadingText="Logging out all..."          // Text while loading
                bg="red.600"                              // Red background for danger action
                _hover={{ bg: "red.700" }}                // Darker red on hover
                color="white"                             // White text for contrast
                size="lg"                                 // Large button for emphasis
                w="160px"                                 // Fixed width
                h="40px"                                  // Fixed height
            >
                Logout All Devices
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
// Export LogoutAllButtonComponent for reuse in parent components
export default LogoutAllButtonComponent;