// ---------------------------- External Imports ----------------------------
// Import Redux Toolkit helpers for slices and async thunks
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// Import API function to get current user
import { getCurrentUserApi } from "../../api/auth_api";

// ---------------------------- State Type Definition ----------------------------
/**
 * CurrentUserState
 * ----------------------------
 * Defines the shape of the current user Redux state
 * Fields:
 *   1. isAuthenticated - null = not checked yet, true/false = authenticated status
 *   2. loading - True when API request is in progress
 *   3. error - Stores error message if request fails
 */
interface CurrentUserState {
    isAuthenticated: boolean | null; // Step 1: Authentication status (null = unchecked)
    loading: boolean;                // Step 2: Loading indicator
    error: string | null;            // Step 3: Error message
}

// ---------------------------- Initial State ----------------------------
/**
 * initialState
 * ----------------------------
 * Default values for the current user slice
 */
const initialState: CurrentUserState = {
    isAuthenticated: null, // Step 1: Not checked yet
    loading: false,        // Step 2: Not loading
    error: null,           // Step 3: No error
};

// ---------------------------- Async Thunks ----------------------------
/**
 * fetchCurrentUser
 * ----------------------------
 * Input: Optional source string to indicate origin of fetch call
 * Process:
 *   1. Log the source of the fetch call for debugging
 *   2. Call API to get current user
 *   3. Return true if API response is successful (status 200)
 *   4. Catch errors and reject with false
 * Output: boolean indicating authentication status; rejected with false on error
 */
export const fetchCurrentUser = createAsyncThunk<
    boolean,            // Success return type: true if authenticated
    string | undefined, // Argument type: optional source string
    { rejectValue: boolean } // Rejection type: false on error
>(
    "currentUser/fetchCurrentUser", // Action type namespace
    async (src: string = "ReduxSlice", { rejectWithValue }) => {
        try {
            // Step 1: Log the source of the fetch call
            console.log("fetchCurrentUser called from:", src);

            // Step 2: Call API to get current user
            const res = await getCurrentUserApi(src);

            // Step 3: Return true if API response is 200 OK
            return res.status === 200;
        } catch (err) {
            // Step 4: Reject with false if error occurs
            return rejectWithValue(false);
        }
    }
);

// ---------------------------- Slice ----------------------------
/**
 * currentUserSlice
 * ----------------------------
 * Manages the current user authentication state
 * Reducers:
 *   1. resetAuthState - Reset authentication state to initial values
 */
export const currentUserSlice = createSlice({
    name: "currentUser",  // Step 1: Slice name for action prefixing
    initialState,         // Step 2: Set initial state
    reducers: {
        /**
         * resetAuthState
         * ----------------------------
         * Input: None
         * Process:
         *   1. Reset isAuthenticated to null (unchecked)
         *   2. Reset loading to false
         *   3. Reset error to null
         * Output: Redux state reset to initial values
         */
        resetAuthState: (state) => {
            state.isAuthenticated = null; // Step 1: Reset auth status
            state.loading = false;        // Step 2: Reset loading
            state.error = null;           // Step 3: Reset error
        },
    },
    extraReducers: (builder) => {
        // Handle different states of the fetchCurrentUser async thunk
        builder
            // ---------------------------- Pending State ----------------------------
            // Step 1: Request is in progress
            .addCase(fetchCurrentUser.pending, (state) => {
                state.loading = true;  // Step 1a: Show loading indicator
                state.error = null;    // Step 1b: Clear previous errors
            })
            // ---------------------------- Fulfilled State ----------------------------
            // Step 2: Request completed successfully
            .addCase(fetchCurrentUser.fulfilled, (state, action) => {
                state.loading = false;                 // Step 2a: Stop loading
                state.isAuthenticated = action.payload; // Step 2b: Set auth status
            })
            // ---------------------------- Rejected State ----------------------------
            // Step 3: Request failed
            .addCase(fetchCurrentUser.rejected, (state) => {
                state.loading = false;          // Step 3a: Stop loading
                state.isAuthenticated = false;  // Step 3b: Set auth to false
                state.error = "Failed to fetch current user"; // Step 3c: Set error message
            });
    },
});

// ---------------------------- Exports ----------------------------
// Export reset action for manual state reset
export const { resetAuthState } = currentUserSlice.actions;

// Export reducer for store integration
export default currentUserSlice.reducer;