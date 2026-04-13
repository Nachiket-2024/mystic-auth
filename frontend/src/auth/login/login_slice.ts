// ---------------------------- External Imports ----------------------------
// Import Redux Toolkit functions for creating slices and async thunks
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

// Import PayloadAction type for typed action handling
import type { PayloadAction } from "@reduxjs/toolkit";

// ---------------------------- Internal Imports ----------------------------
// Import authentication API functions
import { loginApi, getCurrentUserApi } from "../../api/auth_api";

// Import types for login request payload
import type { LoginRequest } from "./login_types";

// ---------------------------- State Type Definition ----------------------------
/**
 * LoginState
 * ----------------------------
 * Defines the shape of the login Redux state
 * Fields:
 *   1. loading - Indicates if login or fetch is in progress
 *   2. error - Stores error message if any
 *   3. user - Authenticated user information
 *   4. isAuthenticated - Authentication status flag
 */
interface LoginState {
    loading: boolean;                       // Step 1: Request in progress flag
    error: string | null;                   // Step 2: Error message storage
    user: { id: string; email: string } | null; // Step 3: User info storage
    isAuthenticated: boolean;               // Step 4: Auth status flag
}

// ---------------------------- Initial State ----------------------------
/**
 * initialState
 * ----------------------------
 * Default values for the login slice
 */
const initialState: LoginState = {
    loading: false,          // Step 1: Not loading
    error: null,             // Step 2: No error
    user: null,              // Step 3: No user
    isAuthenticated: false,  // Step 4: Not authenticated
};

// ---------------------------- Async Thunks ----------------------------
/**
 * fetchCurrentUser
 * ----------------------------
 * Input: Optional source string for logging and debugging
 * Process:
 *   1. Call API to fetch current user session
 *   2. Return true if API response status is 200 (authenticated)
 *   3. Reject with false on API error
 * Output: boolean indicating authentication status
 */
export const fetchCurrentUser = createAsyncThunk<
    boolean,
    string | undefined,
    { rejectValue: boolean }
>(
    "currentUser/fetchCurrentUser",
    async (src = "ReduxSlice", { rejectWithValue }) => {
        try {
            // Step 1: Call API to get current user
            const res = await getCurrentUserApi(src);

            // Step 2: Return true if API confirms authentication
            return res.status === 200;
        } catch {
            // Step 3: Reject with false on error
            return rejectWithValue(false);
        }
    }
);

/**
 * loginUser
 * ----------------------------
 * Input: LoginRequest payload containing email and password
 * Process:
 *   1. Call login API with user credentials
 *   2. Dispatch fetchCurrentUser to update authentication state
 *   3. Fetch user info if authentication is successful
 *   4. Return user info or reject with error message
 * Output: User object (id, email) on success, or error string on failure
 */
export const loginUser = createAsyncThunk<
    { id: string; email: string },
    LoginRequest,
    { rejectValue: string }
>(
    "auth/login",
    async (payload, thunkAPI) => {
        try {
            // Step 1: Call login API
            await loginApi(payload);

            // Step 2: Update auth state in Redux
            const isAuth = await thunkAPI.dispatch(fetchCurrentUser("loginUserThunk")).unwrap();
            if (!isAuth) throw new Error("Authentication failed");

            // Step 3: Fetch user info
            const res = await getCurrentUserApi("loginUserThunk");

            // Step 4: Return user info
            return res.data;
        } catch (error: any) {
            // Step 5: Reject with meaningful error message
            return thunkAPI.rejectWithValue(error.response?.data?.error || "Login failed");
        }
    }
);

// ---------------------------- Slice ----------------------------
/**
 * loginSlice
 * ----------------------------
 * Manages login and authentication state
 * Reducers:
 *   1. clearLoginState - Reset entire slice to initial state
 *   2. resetAuthMessages - Clear any stale error messages
 */
const loginSlice = createSlice({
    name: "login",           // Step 1: Slice name for action prefixing
    initialState,            // Step 2: Initial state
    reducers: {
        /**
         * clearLoginState
         * ----------------------------
         * Input: None
         * Process:
         *   1. Set loading to false
         *   2. Clear error message
         *   3. Clear user data
         *   4. Set isAuthenticated to false
         * Output: Redux state reset to initial values
         */
        clearLoginState: (state) => {
            state.loading = false;           // Step 1: Stop loading
            state.error = null;              // Step 2: Clear error
            state.user = null;               // Step 3: Clear user
            state.isAuthenticated = false;   // Step 4: Reset auth status
        },

        /**
         * resetAuthMessages
         * ----------------------------
         * Input: None
         * Process:
         *   1. Clear error message only, preserve other state
         * Output: Cleared error state
         */
        resetAuthMessages: (state) => {
            state.error = null;               // Step 1: Clear error message
        }
    },
    extraReducers: (builder) => {
        // ---------------------------- Login User Pending ----------------------------
        builder.addCase(loginUser.pending, (state) => {
            state.loading = true;             // Step 1: Show loading indicator
            state.error = null;               // Step 2: Clear previous errors
        });

        // ---------------------------- Login User Fulfilled ----------------------------
        builder.addCase(loginUser.fulfilled, (state, action: PayloadAction<{ id: string; email: string }>) => {
            state.loading = false;             // Step 1: Stop loading
            state.user = action.payload;       // Step 2: Store user info
            state.isAuthenticated = true;      // Step 3: Set authenticated
            state.error = null;                // Step 4: Clear stale messages
        });

        // ---------------------------- Login User Rejected ----------------------------
        builder.addCase(loginUser.rejected, (state, action) => {
            state.loading = false;             // Step 1: Stop loading
            state.error = action.payload || "Login failed"; // Step 2: Store error
            state.isAuthenticated = false;     // Step 3: Set unauthenticated
        });

        // ---------------------------- Fetch Current User Fulfilled ----------------------------
        builder.addCase(fetchCurrentUser.fulfilled, (state, action: PayloadAction<boolean>) => {
            state.isAuthenticated = action.payload; // Step 1: Update auth status
        });

        // ---------------------------- Fetch Current User Rejected ----------------------------
        builder.addCase(fetchCurrentUser.rejected, (state) => {
            state.isAuthenticated = false;     // Step 1: Set unauthenticated
        });
    },
});

// ---------------------------- Exports ----------------------------
// Export actions for manual dispatch
export const { clearLoginState, resetAuthMessages } = loginSlice.actions;

// Export reducer for store integration
export default loginSlice.reducer;