// ---------------------------- External Imports ----------------------------
// Redux Toolkit functions for creating slices and async thunks
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// Type-only import for PayloadAction
import type { PayloadAction } from "@reduxjs/toolkit";

// ---------------------------- Internal Imports ----------------------------
// API function to verify account
import { verifyAccountApi } from "../../api/auth_api";

// Types for verify account request and response
import type { VerifyAccountPayload, VerifyAccountResponse } from "./verify_account_types";

// ---------------------------- State Type Definition ----------------------------
/**
 * VerifyAccountState
 * ----------------------------
 * Defines the Redux state structure for account verification
 * Fields:
 *   1. loading - Indicates request in progress
 *   2. error - Error message if verification fails
 *   3. successMessage - Message on successful verification
 */
interface VerifyAccountState {
    loading: boolean;              // Step 1: Request in progress flag
    error: string | null;          // Step 2: Error message storage
    successMessage: string | null; // Step 3: Success message storage
}

// ---------------------------- Initial State ----------------------------
/**
 * initialState
 * ----------------------------
 * Default state values for account verification
 */
const initialState: VerifyAccountState = {
    loading: false,        // Step 1: Not loading
    error: null,           // Step 2: No error
    successMessage: null,  // Step 3: No success message
};

// ---------------------------- Async Thunk ----------------------------
/**
 * verifyAccount
 * ----------------------------
 * Async action to verify the account using the backend API
 * 
 * Input: VerifyAccountPayload containing email and token
 * Process:
 *   1. Call verifyAccountApi with token and email from payload
 *   2. Return response data if successful
 *   3. Catch errors and reject with meaningful message
 * Output: VerifyAccountResponse on success, or rejected string on error
 */
export const verifyAccount = createAsyncThunk<
    VerifyAccountResponse,   // Success return type
    VerifyAccountPayload,    // Input argument type
    { rejectValue: string }  // Error type
>(
    "auth/verifyAccount",
    async (payload, thunkAPI) => {
        try {
            // Step 1: Call the API with token and email from payload
            const response = await verifyAccountApi(payload.token, payload.email);

            // Step 2: Return the successful response data
            return response.data;
        } catch (error: any) {
            // Step 3: Reject with error message if API call fails
            return thunkAPI.rejectWithValue(
                error.response?.data?.error || "Account verification failed"
            );
        }
    }
);

// ---------------------------- Slice ----------------------------
/**
 * verifyAccountSlice
 * ----------------------------
 * Redux slice managing verify account state
 * Reducers:
 *   1. clearVerifyAccountState - Resets the verification state to initial values
 * Extra reducers handle verifyAccount async thunk states (pending, fulfilled, rejected)
 */
const verifyAccountSlice = createSlice({
    name: "verifyAccount",   // Step 1: Slice name for action prefixing
    initialState,            // Step 2: Initial state
    reducers: {
        /**
         * clearVerifyAccountState
         * ----------------------------
         * Input: None
         * Process:
         *   1. Set loading to false
         *   2. Clear error message
         *   3. Clear success message
         * Output: State reset to initial values
         */
        clearVerifyAccountState: (state) => {
            state.loading = false;         // Step 1: Stop loading
            state.error = null;            // Step 2: Clear error
            state.successMessage = null;   // Step 3: Clear success message
        },
    },
    extraReducers: (builder) => {
        builder
            // ---------------------------- Pending State ----------------------------
            .addCase(verifyAccount.pending, (state) => {
                /**
                 * Process:
                 *   1. Set loading flag to true
                 *   2. Clear previous error
                 *   3. Clear previous success message
                 * Output: State reflects pending API request
                 */
                state.loading = true;        // Step 1: Show loading indicator
                state.error = null;          // Step 2: Clear previous errors
                state.successMessage = null; // Step 3: Clear previous success messages
            })
            // ---------------------------- Fulfilled State ----------------------------
            .addCase(
                verifyAccount.fulfilled,
                (state, action: PayloadAction<VerifyAccountResponse>) => {
                    /**
                     * Input: action.payload of type VerifyAccountResponse
                     * Process:
                     *   1. Set loading to false
                     *   2. Store success message from payload
                     * Output: State reflects successful verification
                     */
                    state.loading = false;                 // Step 1: Stop loading
                    state.successMessage = action.payload.message; // Step 2: Store success message
                }
            )
            // ---------------------------- Rejected State ----------------------------
            .addCase(verifyAccount.rejected, (state, action) => {
                /**
                 * Input: action.payload containing error message
                 * Process:
                 *   1. Set loading to false
                 *   2. Store error message or default message
                 * Output: State reflects failed verification
                 */
                state.loading = false;                           // Step 1: Stop loading
                state.error = action.payload || "Account verification failed"; // Step 2: Store error message
            });
    },
});

// ---------------------------- Exports ----------------------------
// Export action to manually clear verification state
export const { clearVerifyAccountState } = verifyAccountSlice.actions;

// Export the reducer for integration into the store
export default verifyAccountSlice.reducer;