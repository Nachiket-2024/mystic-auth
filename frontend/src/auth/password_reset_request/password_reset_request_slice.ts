// ---------------------------- External Imports ----------------------------
// Redux Toolkit functions for creating slices and async actions
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// Type-only import for strongly-typed Redux actions
import type { PayloadAction } from "@reduxjs/toolkit";

// ---------------------------- Internal Imports ----------------------------
// API wrapper function to request a password reset
import { passwordResetRequestApi } from "../../api/auth_api";

// Type definitions for request payload and response from API
import type {
    PasswordResetRequestPayload,
    PasswordResetRequestResponse,
} from "./password_reset_request_types";

// ---------------------------- State Type Definition ----------------------------
/**
 * PasswordResetRequestState
 * ----------------------------
 * Defines the structure of Redux state for password reset request
 * Fields:
 *   1. loading - True when request is in progress
 *   2. error - Stores error message if request fails
 *   3. successMessage - Stores success message from backend
 */
interface PasswordResetRequestState {
    loading: boolean;              // Step 1: Request in progress flag
    error: string | null;          // Step 2: Error message storage
    successMessage: string | null; // Step 3: Success message storage
}

// ---------------------------- Initial State ----------------------------
/**
 * initialState
 * ----------------------------
 * Default values for the Redux slice state
 */
const initialState: PasswordResetRequestState = {
    loading: false,        // Step 1: Not loading
    error: null,           // Step 2: No error
    successMessage: null,  // Step 3: No success message
};

// ---------------------------- Async Thunk ----------------------------
/**
 * requestPasswordReset
 * ----------------------------
 * Input: PasswordResetRequestPayload containing user email
 * Process:
 *   1. Call API to request password reset
 *   2. Return API response data if successful
 *   3. Handle API error and reject with meaningful message
 * Output: PasswordResetRequestResponse on success, or rejected string on error
 */
export const requestPasswordReset = createAsyncThunk<
    PasswordResetRequestResponse,   // Success return type
    PasswordResetRequestPayload,    // Input argument type
    { rejectValue: string }         // Type of error returned if rejected
>(
    "auth/passwordResetRequest",
    async (payload, thunkAPI) => {
        try {
            // Step 1: Call API to request password reset
            const response = await passwordResetRequestApi(payload);

            // Step 2: Return API response data if successful
            return response.data;
        } catch (error: any) {
            // Step 3: Handle API error and reject with meaningful message
            return thunkAPI.rejectWithValue(
                error.response?.data?.error || "Password reset request failed"
            );
        }
    }
);

// ---------------------------- Slice ----------------------------
/**
 * passwordResetRequestSlice
 * ----------------------------
 * Manages state for password reset request
 * Reducers:
 *   1. clearPasswordResetRequestState - Reset slice to initial state
 */
const passwordResetRequestSlice = createSlice({
    name: "passwordResetRequest",  // Step 1: Slice name for action prefixing
    initialState,                  // Step 2: Initial state
    reducers: {
        /**
         * clearPasswordResetRequestState
         * ----------------------------
         * Input: None
         * Process:
         *   1. Set loading to false
         *   2. Clear error message
         *   3. Clear success message
         * Output: Redux state reset to initial values
         */
        clearPasswordResetRequestState: (state) => {
            state.loading = false;           // Step 1: Stop loading
            state.error = null;              // Step 2: Clear error
            state.successMessage = null;     // Step 3: Clear success message
        },
    },
    extraReducers: (builder) => {
        // Handle different states of the requestPasswordReset async thunk
        builder
            // ---------------------------- Pending State ----------------------------
            .addCase(requestPasswordReset.pending, (state) => {
                state.loading = true;           // Step 1: Show loading indicator
                state.error = null;             // Step 2: Clear previous errors
                state.successMessage = null;    // Step 3: Clear previous success messages
            })
            // ---------------------------- Fulfilled State ----------------------------
            .addCase(
                requestPasswordReset.fulfilled,
                (state, action: PayloadAction<PasswordResetRequestResponse>) => {
                    state.loading = false;                 // Step 1: Stop loading
                    state.successMessage = action.payload.message; // Step 2: Store success message
                }
            )
            // ---------------------------- Rejected State ----------------------------
            .addCase(requestPasswordReset.rejected, (state, action) => {
                state.loading = false;                 // Step 1: Stop loading
                state.error = action.payload || "Password reset request failed"; // Step 2: Store error
            });
    },
});

// ---------------------------- Exports ----------------------------
// Export the action to clear state manually
export const { clearPasswordResetRequestState } =
    passwordResetRequestSlice.actions;

// Export reducer for store integration
export default passwordResetRequestSlice.reducer;