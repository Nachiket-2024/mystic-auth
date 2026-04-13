// ---------------------------- External Imports ----------------------------
// Redux Toolkit functions for creating slices and async thunks
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// Type-only import for PayloadAction (needed for typing actions)
import type { PayloadAction } from "@reduxjs/toolkit";

// ---------------------------- Internal Imports ----------------------------
// API wrapper for performing signup requests
import { signupApi } from "../../api/auth_api";

// Type-only imports for request and response structures
import type { SignupRequest, SignupResponse } from "./signup_types";

// ---------------------------- State Type Definition ----------------------------
/**
 * SignupState
 * ----------------------------
 * Defines the shape of the signup slice state
 * Fields:
 *   1. loading - True while signup request is in progress
 *   2. error - Stores backend or network error message
 *   3. successMessage - Stores success message from backend
 */
interface SignupState {
    loading: boolean;              // Step 1: Request in progress flag
    error: string | null;          // Step 2: Error message storage
    successMessage: string | null; // Step 3: Success message storage
}

// ---------------------------- Initial State ----------------------------
/**
 * initialState
 * ----------------------------
 * Initial values for the signup slice
 */
const initialState: SignupState = {
    loading: false,       // Step 1: No request in progress initially
    error: null,          // Step 2: No errors initially
    successMessage: null, // Step 3: No success message initially
};

// ---------------------------- Async Thunk ----------------------------
/**
 * signupUser
 * ----------------------------
 * Input: SignupRequest payload containing name, email, and password
 * Process:
 *   1. Call backend signup API with provided payload
 *   2. Return API response data if successful
 *   3. Catch errors and return meaningful reject value
 * Output: SignupResponse on success, string error message on failure
 */
export const signupUser = createAsyncThunk<
    SignupResponse,        // Type of successful response
    SignupRequest,         // Input type (signup payload)
    { rejectValue: string } // Error type if request fails
>(
    "auth/signup",
    async (payload: SignupRequest, thunkAPI) => {
        try {
            // Step 1: Call backend signup API
            const response = await signupApi(payload);

            // Step 2: Return API response data on success
            return response.data;
        } catch (error: any) {
            // Step 3: Return error message if request fails
            return thunkAPI.rejectWithValue(
                error.response?.data?.error || "Signup failed"
            );
        }
    }
);

// ---------------------------- Slice ----------------------------
/**
 * signupSlice
 * ----------------------------
 * Manages signup state in Redux store
 * Reducers:
 *   1. clearSignupState - Reset loading, error, and successMessage
 */
const signupSlice = createSlice({
    name: "signup",        // Step 1: Slice name for action prefixing
    initialState,          // Step 2: Initial state
    reducers: {
        /**
         * clearSignupState
         * ----------------------------
         * Input: None
         * Process:
         *   1. Set loading to false
         *   2. Clear error message
         *   3. Clear success message
         * Output: Resets slice state to initial values
         */
        clearSignupState: (state) => {
            state.loading = false;        // Step 1: Stop loading
            state.error = null;           // Step 2: Clear error
            state.successMessage = null;  // Step 3: Clear success message
        },
    },
    extraReducers: (builder) => {
        builder
            // ---------------------------- Pending State ----------------------------
            .addCase(signupUser.pending, (state) => {
                state.loading = true;          // Step 1: Show loading indicator
                state.error = null;            // Step 2: Clear previous errors
                state.successMessage = null;   // Step 3: Clear previous success messages
            })

            // ---------------------------- Fulfilled State ----------------------------
            .addCase(
                signupUser.fulfilled,
                (state, action: PayloadAction<SignupResponse>) => {
                    state.loading = false;                     // Step 1: Stop loading
                    state.successMessage = action.payload.message; // Step 2: Store success message
                }
            )

            // ---------------------------- Rejected State ----------------------------
            .addCase(signupUser.rejected, (state, action) => {
                state.loading = false;                     // Step 1: Stop loading
                state.error = action.payload || "Signup failed"; // Step 2: Store error message
            });
    },
});

// ---------------------------- Exports ----------------------------
// Export Redux actions for manual dispatch
export const { clearSignupState } = signupSlice.actions;

// Export reducer for store integration
export default signupSlice.reducer;