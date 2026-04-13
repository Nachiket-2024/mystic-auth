// ---------------------------- External Imports ----------------------------
// Import createSlice and createAsyncThunk from Redux Toolkit
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// Type-only import for strongly-typed PayloadAction
import type { PayloadAction } from "@reduxjs/toolkit";

// ---------------------------- Internal Imports ----------------------------
// Import API wrapper for password reset confirmation
import { passwordResetConfirmApi } from "../../api/auth_api";

// Import types for password reset confirmation payload and response
import type {
    PasswordResetConfirmPayload,
    PasswordResetConfirmResponse,
} from "./password_reset_confirm_types";

// ---------------------------- State Type Definition ----------------------------
/**
 * PasswordResetConfirmState
 * ----------------------------
 * Defines the Redux state structure for password reset confirmation
 * Fields:
 *   1. loading - True if API request is in progress
 *   2. error - Stores error message if request fails
 *   3. successMessage - Stores success message returned by backend
 */
interface PasswordResetConfirmState {
    loading: boolean;              // Step 1: Request in progress flag
    error: string | null;          // Step 2: Error message storage
    successMessage: string | null; // Step 3: Success message storage
}

// ---------------------------- Initial State ----------------------------
/**
 * initialState
 * ----------------------------
 * Default values for the password reset confirm slice
 */
const initialState: PasswordResetConfirmState = {
    loading: false,          // Step 1: Not loading
    error: null,             // Step 2: No error
    successMessage: null,    // Step 3: No success message
};

// ---------------------------- Async Thunk ----------------------------
/**
 * confirmPasswordReset
 * ----------------------------
 * Input: PasswordResetConfirmPayload containing new password and token
 * Process:
 *   1. Call API to confirm password reset
 *   2. Return response data if successful
 *   3. Handle error and reject with meaningful message
 * Output: PasswordResetConfirmResponse on success, or rejected string on error
 */
export const confirmPasswordReset = createAsyncThunk<
    PasswordResetConfirmResponse,    // Success return type
    PasswordResetConfirmPayload,     // Input payload type
    { rejectValue: string }          // Error type if rejected
>(
    "auth/passwordResetConfirm",
    async (payload, thunkAPI) => {
        try {
            // Step 1: Call API to confirm password reset
            const response = await passwordResetConfirmApi(payload);

            // Step 2: Return response data
            return response.data;
        } catch (error: any) {
            // Step 3: Return rejected value with error message
            return thunkAPI.rejectWithValue(
                error.response?.data?.error || "Password reset confirmation failed"
            );
        }
    }
);

// ---------------------------- Slice ----------------------------
/**
 * passwordResetConfirmSlice
 * ----------------------------
 * Manages state for password reset confirmation
 * Reducers:
 *   1. clearPasswordResetConfirmState - Reset slice to initial state
 */
const passwordResetConfirmSlice = createSlice({
    name: "passwordResetConfirm",   // Step 1: Slice name for action prefixing
    initialState,                   // Step 2: Initial state
    reducers: {
        /**
         * clearPasswordResetConfirmState
         * ----------------------------
         * Input: None
         * Process:
         *   1. Set loading to false
         *   2. Clear error message
         *   3. Clear success message
         * Output: Redux state reset to initial values
         */
        clearPasswordResetConfirmState: (state) => {
            state.loading = false;          // Step 1: Stop loading
            state.error = null;             // Step 2: Clear error
            state.successMessage = null;    // Step 3: Clear success message
        },
    },
    extraReducers: (builder) => {
        // Handle different states of the confirmPasswordReset async thunk
        builder
            // ---------------------------- Pending State ----------------------------
            .addCase(confirmPasswordReset.pending, (state) => {
                state.loading = true;        // Step 1: Show loading indicator
                state.error = null;          // Step 2: Clear previous errors
                state.successMessage = null; // Step 3: Clear previous success messages
            })
            // ---------------------------- Fulfilled State ----------------------------
            .addCase(
                confirmPasswordReset.fulfilled,
                (state, action: PayloadAction<PasswordResetConfirmResponse>) => {
                    state.loading = false;                 // Step 1: Stop loading
                    state.successMessage = action.payload.message; // Step 2: Store success message
                }
            )
            // ---------------------------- Rejected State ----------------------------
            .addCase(confirmPasswordReset.rejected, (state, action) => {
                state.loading = false;                   // Step 1: Stop loading
                state.error = action.payload || "Password reset confirmation failed"; // Step 2: Store error
            });
    },
});

// ---------------------------- Exports ----------------------------
// Export action to manually clear slice state
export const { clearPasswordResetConfirmState } =
    passwordResetConfirmSlice.actions;

// Export reducer for store integration
export default passwordResetConfirmSlice.reducer;