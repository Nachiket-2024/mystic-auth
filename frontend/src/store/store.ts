// ---------------------------- External Imports ----------------------------
// Import configureStore from Redux Toolkit to create the Redux store
import { configureStore } from "@reduxjs/toolkit";

// ---------------------------- Internal Imports ----------------------------
// Import authentication-related reducers
import loginReducer from "../auth/login/login_slice";
import signupReducer from "../auth/signup/signup_slice";
import logoutReducer from "../auth/logout/logout_slice";               // single-device logout
import logoutAllReducer from "../auth/logout_all/logout_all_slice";    // logout from all devices
import oauth2Reducer from "../auth/oauth2/oauth2_slice";
import verifyAccountReducer from "../auth/verify_account/verify_account_slice";
import currentUserReducer from "../auth/current_user/current_user_slice";

// Import password reset reducers
import passwordResetRequestReducer from "../auth/password_reset_request/password_reset_request_slice";
import passwordResetConfirmReducer from "../auth/password_reset_confirm/password_reset_confirm_slice";

// ---------------------------- Store Setup ----------------------------
/**
 * store
 * ----------------------------
 * Redux store instance configured with all application reducers
 * 
 * Input: None
 * Process:
 *   1. Configure Redux store with all authentication, verification, password reset, and current user reducers
 *   2. Map each reducer to its corresponding slice name
 * Output: Redux store instance
 */
export const store = configureStore({
    reducer: {
        // Step 1: login slice manages authentication state (tokens, loading, error)
        login: loginReducer,

        // Step 2: signup slice manages signup state (loading, error, success)
        signup: signupReducer,

        // Step 3: logout slice manages single-device logout state
        logout: logoutReducer,

        // Step 4: logoutAll slice manages logout from all devices state
        logoutAll: logoutAllReducer,

        // Step 5: oauth2 slice manages OAuth2 login state (tokens, loading, error)
        oauth2: oauth2Reducer,

        // Step 6: verifyAccount slice manages account verification state
        verifyAccount: verifyAccountReducer,

        // Step 7: passwordResetRequest slice manages sending password reset emails
        passwordResetRequest: passwordResetRequestReducer,

        // Step 8: passwordResetConfirm slice manages confirming new passwords
        passwordResetConfirm: passwordResetConfirmReducer,

        // Step 9: currentUser slice manages current user state
        currentUser: currentUserReducer,
    },
});

// ---------------------------- Type Definitions ----------------------------
/**
 * RootState
 * ----------------------------
 * TypeScript type representing the entire Redux state tree
 * 
 * Input: None
 * Process:
 *   1. Infer the shape of the Redux state from the store's getState function
 * Output: TypeScript type for Redux state
 */
export type RootState = ReturnType<typeof store.getState>;

/**
 * AppDispatch
 * ----------------------------
 * TypeScript type for the Redux dispatch function with all slice actions and thunks
 * 
 * Input: None
 * Process:
 *   1. Infer the type of Redux dispatch function from the store
 * Output: TypeScript type for dispatch with all slice actions and thunks
 */
export type AppDispatch = typeof store.dispatch;