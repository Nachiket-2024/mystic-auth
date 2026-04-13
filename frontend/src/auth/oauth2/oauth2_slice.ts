// ---------------------------- External Imports ----------------------------
// Import createSlice to define Redux slice and PayloadAction for typing actions
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Import async thunk to fetch current user info
import { fetchCurrentUser } from "../current_user/current_user_slice";

// ---------------------------- State Type Definition ----------------------------
/**
 * OAuth2State
 * ----------------------------
 * Defines the Redux state shape for OAuth2 login and session management
 * Fields:
 *   1. loading - True if login or session verification is in progress
 *   2. error - Stores error message string or null
 *   3. isAuthenticated - True if user is logged in
 *   4. user - Object containing id, email, and role of user, or null
 */
interface OAuth2State {
    loading: boolean;                                         // Step 1: Loading flag
    error: string | null;                                     // Step 2: Error message storage
    isAuthenticated: boolean;                                 // Step 3: Authentication status
    user: { id: string; email: string; role: string } | null; // Step 4: User information
}

// ---------------------------- Initial State ----------------------------
/**
 * initialState
 * ----------------------------
 * Default values for the OAuth2 slice
 */
const initialState: OAuth2State = {
    loading: false,           // Step 1: Not loading initially
    error: null,              // Step 2: No error initially
    isAuthenticated: false,   // Step 3: Not authenticated initially
    user: null,               // Step 4: No user data initially
};

// ---------------------------- Slice ----------------------------
/**
 * oauth2Slice
 * ----------------------------
 * Redux slice handling OAuth2 login and session state
 * Reducers:
 *   1. setUserSession - Store user info and mark authenticated
 *   2. clearUserSession - Reset state to unauthenticated
 *   3. setOAuth2Error - Store error on failed login attempt
 *   4. setOAuth2Loading - Set loading state during API calls
 * Extra reducers handle async fetchCurrentUser thunk
 */
const oauth2Slice = createSlice({
    name: "oauth2",          // Step 1: Slice name for action prefixing
    initialState,            // Step 2: Initial state
    reducers: {
        /**
         * setUserSession
         * ----------------------------
         * Input: user object containing id, email, and role
         * Process:
         *   1. Set loading to false
         *   2. Clear error message
         *   3. Mark user as authenticated
         *   4. Store user information in state
         * Output: Updated Redux state
         */
        setUserSession: (state, action: PayloadAction<{ id: string; email: string; role: string }>) => {
            state.loading = false;            // Step 1: Stop loading
            state.error = null;               // Step 2: Clear error
            state.isAuthenticated = true;     // Step 3: Set authenticated
            state.user = action.payload;      // Step 4: Store user info
        },

        /**
         * clearUserSession
         * ----------------------------
         * Input: None
         * Process:
         *   1. Set loading to false
         *   2. Clear error message
         *   3. Set isAuthenticated to false
         *   4. Clear user data
         * Output: Updated Redux state reset to unauthenticated
         */
        clearUserSession: (state) => {
            state.loading = false;           // Step 1: Stop loading
            state.error = null;              // Step 2: Clear error
            state.isAuthenticated = false;   // Step 3: Reset auth status
            state.user = null;               // Step 4: Clear user info
        },

        /**
         * setOAuth2Error
         * ----------------------------
         * Input: error string message
         * Process:
         *   1. Set loading to false
         *   2. Store error message
         *   3. Mark as unauthenticated
         *   4. Clear user data
         * Output: Updated Redux state with error
         */
        setOAuth2Error: (state, action: PayloadAction<string>) => {
            state.loading = false;           // Step 1: Stop loading
            state.error = action.payload;    // Step 2: Store error
            state.isAuthenticated = false;   // Step 3: Reset auth status
            state.user = null;               // Step 4: Clear user
        },

        /**
         * setOAuth2Loading
         * ----------------------------
         * Input: None
         * Process:
         *   1. Set loading to true
         *   2. Clear any previous error
         * Output: Updated Redux state with loading indicator
         */
        setOAuth2Loading: (state) => {
            state.loading = true;            // Step 1: Start loading
            state.error = null;              // Step 2: Clear error
        },
    },
    extraReducers: (builder) => {
        /**
         * Handle fetchCurrentUser async thunk
         * ----------------------------
         * Process:
         *   1. Pending: Set loading true, clear error
         *   2. Fulfilled: Stop loading, update authentication state
         *   3. Rejected: Stop loading, set unauthenticated (do not set error)
         */
        // ---------------------------- Pending State ----------------------------
        builder.addCase(fetchCurrentUser.pending, (state) => {
            state.loading = true;           // Step 1: Set loading indicator
            state.error = null;             // Step 2: Clear error
        });

        // ---------------------------- Fulfilled State ----------------------------
        builder.addCase(fetchCurrentUser.fulfilled, (state, action: PayloadAction<boolean>) => {
            state.loading = false;          // Step 1: Stop loading
            state.isAuthenticated = action.payload; // Step 2: Set auth status from payload
        });

        // ---------------------------- Rejected State ----------------------------
        builder.addCase(fetchCurrentUser.rejected, (state) => {
            state.loading = false;          // Step 1: Stop loading
            state.isAuthenticated = false;  // Step 2: Set unauthenticated
            // Step 3: Do NOT set error to avoid UI confusion
        });
    },
});

// ---------------------------- Exports ----------------------------
// Export slice actions for dispatch in components
export const { setUserSession, clearUserSession, setOAuth2Error, setOAuth2Loading } = oauth2Slice.actions;

// Export reducer for store integration
export default oauth2Slice.reducer;