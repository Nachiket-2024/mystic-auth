// ---------------------------- External Imports ----------------------------
// Import React and useState hook for component state
import React, { useState, useEffect } from "react";

// Import Redux hooks for dispatching actions and selecting state
import { useDispatch, useSelector } from "react-redux";

// Type-only import for typed useSelector hook
import type { TypedUseSelectorHook } from "react-redux";

// Import Chakra UI components for consistent styling
import { Stack, Input, Button, Text, Box } from "@chakra-ui/react";

// ---------------------------- Internal Imports ----------------------------
// Import type-only RootState and AppDispatch from Redux store
import type { RootState, AppDispatch } from "../../store/store";

// Import async thunk and action to clear state from password reset confirm slice
import { confirmPasswordReset, clearPasswordResetConfirmState } from "./password_reset_confirm_slice";

// ---------------------------- Props Interface Definition ----------------------------
/**
 * PasswordResetConfirmFormProps
 * ----------------------------
 * Defines the props accepted by the PasswordResetConfirmForm component
 * Fields:
 *   1. token - Reset token extracted from URL query parameter
 */
interface PasswordResetConfirmFormProps {
    token: string; // Step 1: Token from URL query parameter
}

// ---------------------------- Typed Selector Hook ----------------------------
// Create typed useSelector hook for TypeScript support
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ---------------------------- PasswordResetConfirmForm Component ----------------------------
/**
 * PasswordResetConfirmForm
 * ----------------------------
 * Component to handle password reset confirmation with token and new password
 * 
 * Input: PasswordResetConfirmFormProps containing token from URL
 * Process:
 *   1. Initialize token from props (auto-filled from URL)
 *   2. Manage local state for new password input
 *   3. Validate password strength and display rules checklist
 *   4. Select loading, error, and successMessage from Redux store
 *   5. Dispatch confirmPasswordReset thunk on form submission
 *   6. Dispatch clearPasswordResetConfirmState to reset form state
 * Output: JSX.Element representing password reset confirmation form with Chakra UI styling
 */
const PasswordResetConfirmForm: React.FC<PasswordResetConfirmFormProps> = ({ token: propToken }) => {
    // ---------------------------- Local State ----------------------------
    const [token, setToken] = useState(propToken || ""); // Step 1: Token from props (URL)
    const [newPassword, setNewPassword] = useState("");  // Step 2: New password input
    const [confirmPassword, setConfirmPassword] = useState(""); // Step 3: Confirm password input
    const [localError, setLocalError] = useState("");     // Step 4: Local validation error
    const [passwordStrength, setPasswordStrength] = useState<"Weak" | "Medium" | "Strong" | "">(""); // Step 5: Strength indicator

    // ---------------------------- Redux Hooks ----------------------------
    const dispatch = useDispatch<AppDispatch>();      // Step 1: Typed dispatch function
    const { loading, error, successMessage } = useAppSelector(
        (state) => state.passwordResetConfirm          // Step 2: Extract slice state
    );

    // ---------------------------- Password Validation Functions ----------------------------
    /**
     * checkRules
     * ----------------------------
     * Input: Password string
     * Process: Test password against four security rules
     * Output: Object containing boolean results for each rule
     */
    const checkRules = (pwd: string) => ({
        lengthRule: pwd.length >= 8,                                 // Rule 1: Minimum 8 characters
        upperRule: /[A-Z]/.test(pwd),                                // Rule 2: At least one uppercase letter
        numberRule: /[0-9]/.test(pwd),                               // Rule 3: At least one number
        specialRule: /[!@#$%^&*(),.?":{}|<>]/.test(pwd),             // Rule 4: At least one special character
    });

    /**
     * evaluatePasswordStrength
     * ----------------------------
     * Input: Password string
     * Process:
     *   1. Return empty string if password is empty
     *   2. Count number of passed rules
     *   3. Return Weak for 0-2 rules, Medium for 3 rules, Strong for all 4 rules
     * Output: Password strength level as string
     */
    const evaluatePasswordStrength = (pwd: string): "Weak" | "Medium" | "Strong" | "" => {
        if (!pwd) return ""; // Step 1: Empty password
        const { lengthRule, upperRule, numberRule, specialRule } = checkRules(pwd);
        const passedRules = [lengthRule, upperRule, numberRule, specialRule].filter(Boolean).length;
        if (passedRules <= 2) return "Weak";       // Step 2: Weak if 0-2 rules passed
        if (passedRules === 3) return "Medium";    // Step 3: Medium if 3 rules passed
        return "Strong";                           // Step 4: Strong if all 4 rules passed
    };

    /**
     * validatePassword
     * ----------------------------
     * Input: Password string
     * Process: Check each password rule and return first failure
     * Output: Error message string or null if valid
     */
    const validatePassword = (pwd: string): string | null => {
        const { lengthRule, upperRule, numberRule, specialRule } = checkRules(pwd);
        if (!lengthRule) return "Password must be at least 8 characters long";
        if (!upperRule) return "Password must contain at least one uppercase letter";
        if (!numberRule) return "Password must contain at least one number";
        if (!specialRule) return "Password must contain at least one special character";
        return null; // Step 5: Password valid
    };

    // ---------------------------- Effects ----------------------------
    /**
     * Update token when prop changes
     * ----------------------------
     * Process:
     *   1. Sync local token state with prop token when URL changes
     * Output: Token stored in state for API call
     */
    useEffect(() => {
        if (propToken) {
            setToken(propToken); // Step 1: Update token from URL prop
        }
    }, [propToken]);

    // ---------------------------- Event Handlers ----------------------------
    /**
     * handlePasswordChange
     * ----------------------------
     * Input: Password string value
     * Process:
     *   1. Update password state
     *   2. Update password strength indicator
     * Output: Updated local state
     */
    const handlePasswordChange = (value: string) => {
        setNewPassword(value);                               // Step 1: Update password
        setPasswordStrength(evaluatePasswordStrength(value)); // Step 2: Update strength
    };

    /**
     * handleSubmit
     * ----------------------------
     * Input: Form submission event
     * Process:
     *   1. Prevent default form submission behavior
     *   2. Validate password against security rules
     *   3. Show error if validation fails
     *   4. Check if password and confirm password match
     *   5. Clear any previous local errors
     *   6. Dispatch confirmPasswordReset thunk with token and new password
     * Output: Triggers API call and updates Redux state
     */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault(); // Step 1: Prevent default

        const passwordError = validatePassword(newPassword); // Step 2: Validate password
        if (passwordError) {
            setLocalError(passwordError);                    // Step 3: Show error
            return;
        }

        if (newPassword !== confirmPassword) {               // Step 4: Confirm password match
            setLocalError("Passwords do not match");
            return;
        }

        setLocalError("");                                   // Step 5: Clear errors
        dispatch(confirmPasswordReset({ token, new_password: newPassword })); // Step 6: Dispatch thunk
    };

    /**
     * handleClear
     * ----------------------------
     * Input: None
     * Process:
     *   1. Dispatch clearPasswordResetConfirmState to reset Redux state
     *   2. Clear local token state (if not from URL)
     *   3. Clear local newPassword state
     *   4. Clear confirmPassword state
     *   5. Clear local error
     *   6. Clear password strength
     * Output: Clears messages and resets form state
     */
    const handleClear = () => {
        dispatch(clearPasswordResetConfirmState()); // Step 1: Reset Redux state
        if (!propToken) {
            setToken("");                           // Step 2: Clear token input (only if not from URL)
        }
        setNewPassword("");                         // Step 3: Clear password input
        setConfirmPassword("");                     // Step 4: Clear confirm password
        setLocalError("");                          // Step 5: Clear local error
        setPasswordStrength("");                    // Step 6: Clear password strength
    };

    // Determine if token came from URL (auto-filled)
    const hasTokenFromUrl = !!propToken;
    const rules = checkRules(newPassword); // Compute rules for checklist display

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Stack as form container with full width and gap
     *   2. Conditionally render token input field (hidden if from URL)
     *   3. Render new password input field with strength indicator
     *   4. Render password rules checklist
     *   5. Render confirm password input field
     *   6. Render submit button with loading state
     *   7. Render clear button to reset form
     *   8. Display error message if reset failed
     *   9. Display success message if reset succeeded
     * Output: JSX.Element with Chakra UI styling
     */
    return (
        <Stack as="form" onSubmit={handleSubmit} w="full" gap={4}>
            {/* Step 1: Token input - only show if token not provided via URL */}
            {!hasTokenFromUrl && (
                <Input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Token from email"
                    size="lg"
                    required
                    autoFocus
                />
            )}

            {/* Step 2: New password input with strength indicator */}
            <Input
                type="password"
                value={newPassword}
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder="New Password"
                size="lg"
                required
                autoFocus={hasTokenFromUrl}
            />

            {/* Step 3: Password Strength Indicator */}
            {passwordStrength && (
                <Text
                    fontSize="sm"
                    fontWeight="bold"
                    color={
                        passwordStrength === "Weak" ? "red.500" :
                        passwordStrength === "Medium" ? "orange.400" : "green.500"
                    }
                >
                    Strength: {passwordStrength}
                </Text>
            )}

            {/* Step 4: Password Rules Checklist - 2 per line */}
            <Box
                fontSize="14px"
                color="gray.600"
                textAlign="center"
                display="flex"
                flexDirection="column"
                alignItems="center"
            >
                <Stack direction="row">
                    <Text color={rules.lengthRule ? "green.500" : "red.500"} mr={6}>
                        • {rules.lengthRule ? "✓" : "✗"} At least 8 characters
                    </Text>
                    <Text color={rules.upperRule ? "green.500" : "red.500"}>
                        • {rules.upperRule ? "✓" : "✗"} At least one uppercase letter
                    </Text>
                </Stack>
                <Stack direction="row">
                    <Text color={rules.numberRule ? "green.500" : "red.500"} mr={6}>
                        • {rules.numberRule ? "✓" : "✗"} At least one number
                    </Text>
                    <Text color={rules.specialRule ? "green.500" : "red.500"}>
                        • {rules.specialRule ? "✓" : "✗"} At least one special character
                    </Text>
                </Stack>
            </Box>

            {/* Step 5: Confirm Password input */}
            <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm New Password"
                size="lg"
                required
            />

            {/* Step 6: Submit button with loading state */}
            <Button
                type="submit"
                bg="teal.600"
                _hover={{ bg: "teal.700" }}
                color="white"
                size="lg"
                w="full"
                loading={loading}
                loadingText="Resetting..."
            >
                Reset Password
            </Button>

            {/* Step 7: Clear button */}
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

            {/* Step 8: Display local validation error */}
            {localError && (
                <Text color="red.500" textAlign="center">
                    {localError}
                </Text>
            )}

            {/* Step 9: Display API error message if reset failed */}
            {error && (
                <Text color="red.500" textAlign="center">
                    {error}
                </Text>
            )}

            {/* Step 10: Display success message if reset succeeded */}
            {successMessage && (
                <Text color="green.500" textAlign="center" fontWeight="medium">
                    {successMessage}
                </Text>
            )}
        </Stack>
    );
};

// ---------------------------- Export ----------------------------
// Export PasswordResetConfirmForm as default for use in parent components
export default PasswordResetConfirmForm;