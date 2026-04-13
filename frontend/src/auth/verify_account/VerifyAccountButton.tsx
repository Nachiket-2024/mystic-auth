// ---------------------------- External Imports ----------------------------
// Import React for component logic and lifecycle management
import React, { useEffect } from "react";

// Import Redux hooks for dispatching actions and selecting state
import { useDispatch, useSelector } from "react-redux";

// Type-only import to create a typed selector hook for TypeScript safety
import type { TypedUseSelectorHook } from "react-redux";

// Import Chakra UI components for consistent layout and design
import { Stack, Button, Text, Spinner } from "@chakra-ui/react";

// ---------------------------- Internal Imports ----------------------------
// Import application-level types for Redux store and dispatch
import type { RootState, AppDispatch } from "../../store/store";

// Import Redux slice thunks and actions for verification logic
import { verifyAccount, clearVerifyAccountState } from "./verify_account_slice";

// ---------------------------- Props Interface Definition ----------------------------
/**
 * VerifyAccountButtonProps
 * ----------------------------
 * Defines the props accepted by the VerifyAccountButton component
 * Fields:
 *   1. token - Verification token extracted from URL
 *   2. email - Associated email address of the user
 *   3. onSuccess - Optional callback executed after successful verification
 */
interface VerifyAccountButtonProps {
    token: string;          // Step 1: Verification token from URL
    email: string;          // Step 2: Associated email address
    onSuccess?: () => void; // Step 3: Optional success callback
}

// ---------------------------- Typed Selector Hook ----------------------------
// Create a typed selector hook for strong state typing
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ---------------------------- VerifyAccountButton Component ----------------------------
/**
 * VerifyAccountButton
 * ----------------------------
 * Handles the account verification process and displays relevant UI feedback
 * Responsibilities:
 *   1. Dispatches verifyAccount thunk on button click
 *   2. Triggers onSuccess callback on verification success
 *   3. Clears verification state on component unmount
 * 
 * Input: VerifyAccountButtonProps (token, email, onSuccess)
 * Process:
 *   1. Extract loading, error, and successMessage from Redux verifyAccount slice
 *   2. Trigger onSuccess callback when verification succeeds
 *   3. Clear Redux state on component unmount
 *   4. Dispatch verifyAccount thunk with token and email on button click
 * Output: JSX.Element representing verification button with status messages
 */
const VerifyAccountButton: React.FC<VerifyAccountButtonProps> = ({ token, email, onSuccess }) => {

    // ---------------------------- Redux Hooks ----------------------------
    const dispatch = useDispatch<AppDispatch>();                           // Step 1: Typed Redux dispatcher
    const { loading, error, successMessage } = useAppSelector(
        (state) => state.verifyAccount
    );                                                                     // Step 2: Extract verification slice state

    // ---------------------------- Effects ----------------------------
    /**
     * onSuccess trigger effect
     * ----------------------------
     * Process:
     *   1. Watch for changes in successMessage
     *   2. If verification succeeded and onSuccess callback exists, invoke it
     * Output: Executes redirect or follow-up action after successful verification
     */
    useEffect(() => {
        if (successMessage && onSuccess) onSuccess(); // Step 1: Trigger success callback
    }, [successMessage, onSuccess]);

    /**
     * Cleanup effect
     * ----------------------------
     * Process:
     *   1. Clear Redux slice state when component unmounts
     * Output: Prevents old success or error messages from persisting on page revisit
     */
    useEffect(() => {
        return () => {
            dispatch(clearVerifyAccountState()); // Step 1: Clean slice on unmount
        };
    }, [dispatch]);

    // ---------------------------- Event Handlers ----------------------------
    /**
     * handleVerify
     * ----------------------------
     * Input: None
     * Process:
     *   1. Dispatch verifyAccount thunk with provided token and email
     * Output: Updates loading, error, and success state in Redux
     */
    const handleVerify = () => {
        dispatch(verifyAccount({ token, email })); // Step 1: Dispatch verification thunk
    };

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Stack container with centered alignment
     *   2. Render Verify Account button with loading spinner when in progress
     *   3. Display error message if verification fails
     *   4. Display success message if verification succeeds
     * Output: JSX.Element
     */
    return (
        <Stack align="center" w="full">
            {/* Step 1: Verify Account Button with loading state */}
            <Button
                onClick={handleVerify}
                bg="teal.600"
                _hover={{ bg: "teal.700" }}
                color="white"
                w="60%"
            >
                {loading ? (
                    <>
                        <Spinner size="sm" mr={2} /> Verifying...
                    </>
                ) : (
                    "Verify Account"
                )}
            </Button>

            {/* Step 2: Error message display */}
            {error && (
                <Text fontSize="sm" color="red.500">
                    {error}
                </Text>
            )}

            {/* Step 3: Success message display */}
            {successMessage && (
                <Text fontSize="sm" color="green.500" fontWeight="medium">
                    {successMessage}
                </Text>
            )}
        </Stack>
    );
};

// ---------------------------- Export ----------------------------
// Export component for use within verification page or elsewhere
export default VerifyAccountButton;