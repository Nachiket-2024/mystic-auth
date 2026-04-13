// ---------------------------- External Imports ----------------------------
// Import Redux Toolkit helpers for creating slices and async thunks
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// Import type-only PayloadAction for typing Redux actions
import type { PayloadAction } from "@reduxjs/toolkit";

// ---------------------------- Internal Imports ----------------------------
// Import API function to logout a single device
import { logoutApi } from "../../api/auth_api";

// Import type-only LogoutResponse for typing API response
import type { LogoutResponse } from "./logout_types";

// Import fetchCurrentUser thunk to refresh authentication state
import { fetchCurrentUser } from "../current_user/current_user_slice";

// Import clearLoginState action to reset login slice state
import { clearLoginState } from "../login/login_slice";

// ---------------------------- State Type Definition ----------------------------
/**
 * LogoutState
 * ----------------------------
 * Defines the shape of the logout Redux state
 * Fields:
 *   1. loading - Indicates if logout request is in progress
 *   2. error - Stores error message if request fails
 *   3. successMessage - Stores success message after logout completes
 */
interface LogoutState {
    loading: boolean;              // Step 1: Request in progress flag
    error: string | null;          // Step 2: Error message storage
    successMessage: string | null; // Step 3: Success message storage
}

// ---------------------------- Initial State ----------------------------
/**
 * initialState
 * ----------------------------
 * Default values for the logout slice
 */
const initialState: LogoutState = {
    loading: false,        // Step 1: Not loading
    error: null,           // Step 2: No error
    successMessage: null,  // Step 3: No success message
};

// ---------------------------- Async Thunks ----------------------------
/**
 * logoutUser
 * ----------------------------
 * Handles single-device logout operation
 * 
 * Input: None
 * Process:
 *   1. Call API to logout current device
 *   2. Dispatch clearLoginState to reset login slice user data
 *   3. Dispatch fetchCurrentUser to refresh authentication state
 *   4. Return API response data if successful
 *   5. Reject with meaningful error message if API fails
 * Output: Redux async thunk with success or error payload
 */
export const logoutUser = createAsyncThunk<
    LogoutResponse,
    void,
    { rejectValue: string; dispatch: any }
>(
    "logout/logoutUser",
    async (_, thunkAPI) => {
        try {
            // Step 1: Call API to logout current device
            const response = await logoutApi();

            // Step 2: Clear login slice state (user data)
            thunkAPI.dispatch(clearLoginState());

            // Step 3: Refresh currentUser authentication state
            await thunkAPI.dispatch(fetchCurrentUser("logoutThunk")).unwrap();

            // Step 4: Return API response data
            return response.data;
        } catch (error: any) {
            // Step 5: Reject with meaningful error message
            return thunkAPI.rejectWithValue(
                error.response?.data?.error || "Logout failed"
            );
        }
    }
);

// ---------------------------- Slice ----------------------------
/**
 * logoutSlice
 * ----------------------------
 * Manages single-device logout state
 * Reducers:
 *   1. clearLogoutState - Reset slice to initial state
 */
const logoutSlice = createSlice({
    name: "logout",        // Step 1: Slice name for action prefixing
    initialState,          // Step 2: Initial state
    reducers: {
        /**
         * clearLogoutState
         * ----------------------------
         * Input: None
         * Process:
         *   1. Set loading to false
         *   2. Clear error message
         *   3. Clear success message
         * Output: Redux state reset to initial values
         */
        clearLogoutState: (state) => {
            state.loading = false;        // Step 1: Stop loading
            state.error = null;           // Step 2: Clear error
            state.successMessage = null;  // Step 3: Clear success message
        },
    },
    extraReducers: (builder) => {
        // ---------------------------- Logout User Pending ----------------------------
        builder.addCase(logoutUser.pending, (state) => {
            state.loading = true;          // Step 1: Show loading indicator
            state.error = null;            // Step 2: Clear previous errors
            state.successMessage = null;   // Step 3: Clear previous success messages
        });

        // ---------------------------- Logout User Fulfilled ----------------------------
        builder.addCase(
            logoutUser.fulfilled,
            (state, action: PayloadAction<LogoutResponse>) => {
                state.loading = false;                     // Step 1: Stop loading
                state.successMessage = action.payload.message; // Step 2: Store success message
                state.error = null;                        // Step 3: Ensure no error is displayed
            }
        );

        // ---------------------------- Logout User Rejected ----------------------------
        builder.addCase(logoutUser.rejected, (state, action) => {
            state.loading = false;                   // Step 1: Stop loading
            state.error = action.payload || "Logout failed"; // Step 2: Store error message
            state.successMessage = null;             // Step 3: Ensure no success message is displayed
        });
    },
});

// ---------------------------- Exports ----------------------------
// Export action to reset logout state manually
export const { clearLogoutState } = logoutSlice.actions;

// Export reducer for store integration
export default logoutSlice.reducer;