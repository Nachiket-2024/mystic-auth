// ---------------------------- External Imports ----------------------------
// React core and useState hook for managing local component state
import React, { useState } from "react";

// Redux hooks for dispatching actions and selecting state
import { useDispatch, useSelector } from "react-redux";

// Type-only import for typed selector hook
import type { TypedUseSelectorHook } from "react-redux";

// Import Chakra UI components for consistent styling
import { Stack, Input, Button, Text } from "@chakra-ui/react";

// ---------------------------- Internal Imports ----------------------------
// Type-only RootState and AppDispatch for typed Redux hooks
import type { RootState, AppDispatch } from "../../store/store";

// Import async thunk and clear state action for password reset requests
import { requestPasswordReset, clearPasswordResetRequestState } from "./password_reset_request_slice";

// ---------------------------- Typed Selector Hook ----------------------------
// Create a strongly typed useSelector hook for TypeScript support
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ---------------------------- PasswordResetRequestForm Component ----------------------------
/**
 * PasswordResetRequestForm
 * ----------------------------
 * Handles the password reset request form for users to request password reset emails
 * 
 * Input: None (no props)
 * Process:
 *   1. Manage local state for email input
 *   2. Select loading, error, and successMessage from Redux store
 *   3. Dispatch requestPasswordReset thunk on form submission
 *   4. Dispatch clearPasswordResetRequestState to reset form state
 *   5. Implement cooldown timer to prevent spam requests
 * Output: JSX.Element representing password reset request form with Chakra UI styling
 */
const PasswordResetRequestForm: React.FC = () => {
    // ---------------------------- Local State ----------------------------
    const [email, setEmail] = useState(""); // Step 1: Store email input from user
    const [cooldown, setCooldown] = useState(0); // Step 2: Cooldown timer in seconds

    // ---------------------------- Redux Hooks ----------------------------
    const dispatch = useDispatch<AppDispatch>();      // Step 1: Get typed dispatch function
    const { error, successMessage, loading } = useAppSelector(
        (state) => state.passwordResetRequest           // Step 2: Extract Redux state
    );

    // ---------------------------- Helper Functions ----------------------------
    /**
     * startCooldown
     * ----------------------------
     * Input: None
     * Process:
     *   1. Set cooldown to 60 seconds
     *   2. Create interval to decrement cooldown every second
     *   3. Clear interval when cooldown reaches 0
     * Output: None
     */
    const startCooldown = () => {
        setCooldown(60); // 60 seconds cooldown
        
        const interval = setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // ---------------------------- Event Handlers ----------------------------
    /**
     * handleSubmit
     * ----------------------------
     * Input: Form submit event
     * Process:
     *   1. Prevent default form submission behavior
     *   2. Check if cooldown is active (prevent spam)
     *   3. Dispatch async thunk to request password reset with the provided email
     *   4. Start cooldown timer to prevent multiple requests
     * Output: Redux state updated with loading, error, or successMessage
     */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();                          // Step 1: Prevent default
        
        // Step 2: Prevent submission if cooldown is active
        if (cooldown > 0) {
            return;
        }
        
        dispatch(requestPasswordReset({ email }));   // Step 3: Dispatch thunk
        startCooldown();                             // Step 4: Start cooldown timer
    };

    /**
     * handleClear
     * ----------------------------
     * Input: None
     * Process:
     *   1. Dispatch Redux action to reset password reset request state
     *   2. Clear local email state
     *   3. Reset cooldown timer
     * Output: Redux state reset to initial values, form cleared
     */
    const handleClear = () => {
        dispatch(clearPasswordResetRequestState()); // Step 1: Reset Redux state
        setEmail("");                               // Step 2: Clear local email state
        setCooldown(0);                             // Step 3: Reset cooldown
    };

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Stack as form container with full width and spacing
     *   2. Render email input field with Chakra styling
     *   3. Render submit button with loading state and cooldown display
     *   4. Render clear button to reset form
     *   5. Display error message if request failed
     *   6. Display success message if request succeeded
     * Output: JSX.Element with Chakra UI styling
     */
    return (
        <Stack as="form" onSubmit={handleSubmit} w="full">
            {/* Step 1: Email input field */}
            <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                size="lg"
                required
                autoFocus
                disabled={loading}
            />

            {/* Step 2: Submit button with loading state and cooldown */}
            <Button
                type="submit"
                bg="teal.600"
                _hover={{ bg: "teal.700" }}
                color="white"
                size="lg"
                w="full"
                loading={loading}
                disabled={cooldown > 0 || loading} // Fixed: Changed isDisabled to disabled
                loadingText="Sending..."
            >
                {cooldown > 0 ? `Try again in ${cooldown}s` : "Request Password Reset"}
            </Button>

            {/* Step 3: Clear button */}
            <Button
                type="button"
                bg="gray.300"
                _hover={{ bg: "gray.400" }}
                color="gray.700"
                size="lg"
                w="full"
                onClick={handleClear}
                disabled={loading} // Fixed: Changed isDisabled to disabled
            >
                Clear
            </Button>

            {/* Step 4: Display error message if request failed */}
            {error && (
                <Text color="red.500" textAlign="center">
                    {error}
                </Text>
            )}

            {/* Step 5: Display success message if request succeeded */}
            {successMessage && (
                <Text color="green.500" textAlign="center" fontWeight="medium">
                    {successMessage}
                </Text>
            )}
        </Stack>
    );
};

// ---------------------------- Export ----------------------------
// Export PasswordResetRequestForm component for use in page
export default PasswordResetRequestForm;