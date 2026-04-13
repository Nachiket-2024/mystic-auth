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
 * Output: JSX.Element representing password reset request form with Chakra UI styling
 */
const PasswordResetRequestForm: React.FC = () => {
    // ---------------------------- Local State ----------------------------
    const [email, setEmail] = useState(""); // Step 1: Store email input from user

    // ---------------------------- Redux Hooks ----------------------------
    const dispatch = useDispatch<AppDispatch>();      // Step 1: Get typed dispatch function
    const { error, successMessage } = useAppSelector(
        (state) => state.passwordResetRequest           // Step 2: Extract Redux state
    );

    // ---------------------------- Event Handlers ----------------------------
    /**
     * handleSubmit
     * ----------------------------
     * Input: Form submit event
     * Process:
     *   1. Prevent default form submission behavior
     *   2. Dispatch async thunk to request password reset with the provided email
     * Output: Redux state updated with loading, error, or successMessage
     */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();                          // Step 1: Prevent default
        dispatch(requestPasswordReset({ email }));   // Step 2: Dispatch thunk
    };

    /**
     * handleClear
     * ----------------------------
     * Input: None
     * Process:
     *   1. Dispatch Redux action to reset password reset request state
     *   2. Clear local email state
     * Output: Redux state reset to initial values, form cleared
     */
    const handleClear = () => {
        dispatch(clearPasswordResetRequestState()); // Step 1: Reset Redux state
        setEmail("");                               // Step 2: Clear local email state
    };

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Stack as form container with full width and spacing
     *   2. Render email input field with Chakra styling
     *   3. Render submit button with loading state
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
            />

            {/* Step 2: Submit button with loading state */}
            <Button
                type="submit"
                bg="teal.600"
                _hover={{ bg: "teal.700" }}
                color="white"
                size="lg"
                w="full"
                loadingText="Requesting..."
            >
                Request Password Reset
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