// ---------------------------- External Imports ----------------------------
// Import React core and hooks for local state and side effects
import React, { useState, useEffect } from "react";

// Import Redux hooks for dispatching actions and selecting state
import { useDispatch, useSelector } from "react-redux";

// Type-only import for typed useSelector hook
import type { TypedUseSelectorHook } from "react-redux";

// Import Chakra UI components for inputs and buttons
import { Input, Button, Stack, Text } from "@chakra-ui/react";

// Import Link for navigation
import { Link } from "react-router-dom";

// ---------------------------- Internal Imports ----------------------------
// Type-only imports for Redux store
import type { RootState, AppDispatch } from "../../store/store";

// Import login thunk and slice actions
import { loginUser, clearLoginState } from "./login_slice";

// ---------------------------- Props Interface Definition ----------------------------
/**
 * LoginFormProps
 * ----------------------------
 * Defines the props accepted by the LoginForm component
 * Fields:
 *   1. onSuccess - Optional callback executed after successful login
 *   2. onAttempt - Optional callback triggered when a login attempt starts
 */
interface LoginFormProps {
    onSuccess?: () => void; // Step 1: Success callback
    onAttempt?: () => void; // Step 2: Attempt callback
}

// ---------------------------- Typed Selector Hook ----------------------------
// Create typed selector hook for TypeScript support
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ---------------------------- LoginForm Component ----------------------------
/**
 * LoginForm
 * ----------------------------
 * High-level component responsible for:
 *   1. Rendering email and password input fields
 *   2. Dispatching login thunk to Redux
 *   3. Handling success and failure messages
 *   4. Clearing form and Redux login state
 * 
 * Input: LoginFormProps (onSuccess, onAttempt callbacks)
 * Process:
 *   1. Manage local email and password state
 *   2. Dispatch loginUser action on form submission
 *   3. Redirect via onSuccess callback when authenticated
 *   4. Clear form and Redux state via handleClear
 * Output: JSX.Element representing login form
 */
const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onAttempt }) => {
    // ---------------------------- Local State ----------------------------
    const [email, setEmail] = useState("");       // Step 1: Email input state
    const [password, setPassword] = useState(""); // Step 2: Password input state

    // ---------------------------- Redux Hooks ----------------------------
    const dispatch = useDispatch<AppDispatch>(); // Step 1: Typed dispatch function
    const { error, isAuthenticated } = useAppSelector(
        (state) => state.login // Step 2: Extract login slice state
    );

    // ---------------------------- Effects ----------------------------
    /**
     * Redirect on successful authentication
     * ----------------------------
     * Process:
     *   1. Check if isAuthenticated is true and onSuccess callback exists
     *   2. Execute onSuccess callback to notify parent component
     * Output: Parent component handles navigation
     */
    useEffect(() => {
        if (isAuthenticated && onSuccess) {
            onSuccess(); // Step 1: Notify parent of successful login
        }
    }, [isAuthenticated, onSuccess]);

    // ---------------------------- Event Handlers ----------------------------
    /**
     * handleSubmit
     * ----------------------------
     * Input: Form submission event
     * Process:
     *   1. Prevent default form submission behavior
     *   2. Notify parent that a login attempt has started
     *   3. Dispatch loginUser thunk with email and password
     * Output: Redux action dispatched, API call initiated
     */
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();                    // Step 1: Prevent default
        onAttempt?.();                         // Step 2: Notify parent
        dispatch(loginUser({ email, password })); // Step 3: Dispatch login
    };

    /**
     * handleClear
     * ----------------------------
     * Input: None
     * Process:
     *   1. Dispatch clearLoginState to reset Redux login state
     *   2. Reset local email state to empty string
     *   3. Reset local password state to empty string
     * Output: Form and Redux state cleared
     */
    const handleClear = () => {
        dispatch(clearLoginState()); // Step 1: Clear Redux state
        setEmail("");                // Step 2: Clear email input
        setPassword("");             // Step 3: Clear password input
    };

    // ---------------------------- Render ----------------------------
    /**
     * Render
     * ----------------------------
     * Process:
     *   1. Render Stack container with full width
     *   2. Render email input field
     *   3. Render password input field
     *   4. Render Login button
     *   5. Render Clear button
     *   6. Render Forgot Password link
     *   7. Render error message if present
     *   8. Render success message if authenticated
     * Output: JSX.Element
     */
    return (
        <Stack w="full">
            {/* Step 1: Email input field */}
            <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
            />

            {/* Step 2: Password input field */}
            <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
            />

            {/* Step 3: Login submission button */}
            <Button
                type="submit"
                bg="teal.600"
                _hover={{ bg: "teal.700" }}
                color="white"
                size="lg"
                w="full"
                onClick={handleSubmit}
            >
                Login
            </Button>

            {/* Step 4: Clear form button */}
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

            {/* Step 5: Forgot password navigation link */}
            <Text fontSize="md" textAlign="right" width="100%">
                <Link to="/password-reset-request" style={{ color: "#319795", fontWeight: 600}}>
                    Forgot Password?
                </Link>
            </Text>

            {/* Step 6: Error message display */}
            {error && <Text color="red.500">{error}</Text>}

            {/* Step 7: Success message display */}
            {isAuthenticated && <Text color="green.500">Login successful!</Text>}
        </Stack>
    );
};

// ---------------------------- Export ----------------------------
// Export LoginForm component for reuse in parent components
export default LoginForm;