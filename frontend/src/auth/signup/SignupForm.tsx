// ---------------------------- External Imports ----------------------------
// React core and state management
import React, { useState } from "react";

// Redux hooks for dispatch and typed selector
import { useDispatch, useSelector } from "react-redux";
import type { TypedUseSelectorHook } from "react-redux";

// Chakra UI components for layout, inputs, buttons, text, and boxes
import { Stack, Input, Button, Text, Box } from "@chakra-ui/react";

// Chakra UI Field components for form field composition (v3)
import { Field as ChakraField } from "@chakra-ui/react";

// ---------------------------- Internal Imports ----------------------------
// TypeScript types for Redux store and dispatch
import type { RootState, AppDispatch } from "../../store/store";

// Redux thunks and actions for signup and clearing signup state
import { signupUser, clearSignupState } from "./signup_slice";

// ---------------------------- Typed Selector Hook ----------------------------
// Strongly-typed useSelector for accessing Redux state
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ---------------------------- SignupForm Component ----------------------------
/**
 * SignupForm
 * ----------------------------
 * Functional component for user signup using Chakra UI v3
 * Responsibilities:
 *   1. Validate password against security rules
 *   2. Evaluate and display password strength
 *   3. Handle form submission and dispatch signup action
 *   4. Reset form and Redux state via clear handler
 * 
 * Input: None (no props)
 * Process:
 *   1. Manage local state for name, email, password, and confirm password
 *   2. Validate password strength and rules in real-time
 *   3. Dispatch signupUser thunk on valid form submission
 *   4. Clear form and Redux state via handleClear
 * Output: JSX.Element representing signup form
 */
const SignupForm: React.FC = () => {

    // ---------------------------- Local State ----------------------------
    const [name, setName] = useState("");                       // Step 1: Name input value
    const [email, setEmail] = useState("");                     // Step 2: Email input value
    const [password, setPassword] = useState("");               // Step 3: Password input value
    const [confirmPassword, setConfirmPassword] = useState(""); // Step 4: Confirm password input value

    const [localError, setLocalError] = useState("");           // Step 5: Local validation error
    const [passwordStrength, setPasswordStrength] = useState<"Weak" | "Medium" | "Strong" | "">(""); // Step 6: Strength indicator

    // ---------------------------- Redux Hooks ----------------------------
    const dispatch = useDispatch<AppDispatch>();               // Step 1: Typed dispatch for actions
    const { error, successMessage } = useAppSelector(state => state.signup); // Step 2: Signup slice state

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
        setPassword(value);                                // Step 1: Update password
        setPasswordStrength(evaluatePasswordStrength(value)); // Step 2: Update strength
    };

    /**
     * handleSubmit
     * ----------------------------
     * Input: Form submission event
     * Process:
     *   1. Validate password against security rules
     *   2. Show error if validation fails
     *   3. Check if password and confirm password match
     *   4. Clear any previous local errors
     *   5. Dispatch signupUser thunk with form data
     * Output: Redux action dispatched or local error displayed
     */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault(); // Step 1: Prevent default form submission

        const passwordError = validatePassword(password);  // Step 2: Validate password
        if (passwordError) {
            setLocalError(passwordError);                  // Step 3: Show error
            return;
        }

        if (password !== confirmPassword) {                // Step 4: Confirm password match
            setLocalError("Passwords do not match");
            return;
        }

        setLocalError("");                                 // Step 5: Clear errors

        dispatch(signupUser({ name, email, password }));   // Step 6: Dispatch signup
    };

    /**
     * handleClear
     * ----------------------------
     * Input: None
     * Process:
     *   1. Clear all form input fields
     *   2. Clear local validation error
     *   3. Clear password strength indicator
     *   4. Dispatch clearSignupState to reset Redux state
     * Output: Form and Redux state reset
     */
    const handleClear = () => {
        setName(""); setEmail(""); setPassword(""); setConfirmPassword(""); // Step 1: Clear inputs
        setLocalError(""); setPasswordStrength("");                           // Step 2: Clear validation
        dispatch(clearSignupState());                                         // Step 3: Reset Redux slice
    };

    const rules = checkRules(password); // Compute rules for checklist display

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Stack as form container
     *   2. Render name and email fields in row layout
     *   3. Render password field with strength indicator
     *   4. Render password rules checklist
     *   5. Render confirm password field
     *   6. Display error and success messages
     *   7. Render action buttons (Signup, Clear, Login redirect)
     * Output: JSX.Element
     */
    return (
        <Stack as="form" onSubmit={handleSubmit} w="full">
            {/* Step 1: Name and Email fields on one line */}
            <Stack direction="row">
                {/* Step 1a: Name Field */}
                <ChakraField.Root required flex={1}>
                    <ChakraField.Label>Name</ChakraField.Label>
                    <Input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Enter your name"
                    />
                </ChakraField.Root>

                {/* Step 1b: Email Field */}
                <ChakraField.Root required flex={1}>
                    <ChakraField.Label>Email</ChakraField.Label>
                    <Input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Enter your email"
                    />
                </ChakraField.Root>
            </Stack>

            {/* Step 2: Password Field with strength indicator */}
            <ChakraField.Root required>
                <ChakraField.Label>Password</ChakraField.Label>
                <Input
                    type="password"
                    value={password}
                    onChange={e => handlePasswordChange(e.target.value)}
                    placeholder="Enter password"
                />
                {/* Step 2a: Password Strength Indicator */}
                {passwordStrength && (
                    <Text
                        mt={1}
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
            </ChakraField.Root>

            {/* Step 3: Password Rules Checklist - 2 per line */}
            <Box 
            fontSize="15px" 
            color="gray.600" 
            textAlign="center"        // Centers text horizontally
            display="flex"            // Enables flex layout for centering
            flexDirection="column"    // Keeps the two rows stacked vertically
            alignItems="center"       // Centers the inner row stacks
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

            {/* Step 4: Confirm Password Field */}
            <ChakraField.Root required>
                <ChakraField.Label>Confirm Password</ChakraField.Label>
                <Input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                />
            </ChakraField.Root>

            {/* Step 5: Error and Success Messages */}
            {localError && <Text color="red.500" fontSize="17px">{localError}</Text>}
            {error && <Text color="red.500" fontSize="17px">{error}</Text>}
            {successMessage && <Text color="green.500" fontSize="17px">{successMessage}</Text>}

            {/* Step 6: Action Buttons */}
            <Box display="flex" alignItems="center">
                {/* Step 6a: Left side - Signup and Clear buttons */}
                <Stack direction="row">
                    <Button
                        type="submit"
                        bg="teal.600"
                        _hover={{ bg: "teal.700" }}
                        color="white"
                    >
                        Signup
                    </Button>

                    <Button
                        type="button"
                        onClick={handleClear}
                        bg="gray.300"
                        _hover={{ bg: "gray.400" }}
                        color="gray.700"
                    >
                        Clear
                    </Button>
                </Stack>

                {/* Step 6b: Right side - Already have an account? + Login button */}
                <Box display="flex" alignItems="center" ml="auto">
                    <Text mr={2} color="gray.700" fontSize="16px">
                        Already have an account?
                    </Text>
                    <Button
                        type="button"
                        bg="blue.600"
                        _hover={{ bg: "blue.700" }}
                        color="white"
                        size="sm"
                        onClick={() => (window.location.href = "/login")}
                    >
                        Login
                    </Button>
                </Box>
            </Box>
        </Stack>
    );
};

// ---------------------------- Export ----------------------------
// Default export of SignupForm component
export default SignupForm;