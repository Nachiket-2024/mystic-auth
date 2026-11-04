import { useMutation } from "@tanstack/react-query";
import { startAuthentication } from "@simplewebauthn/browser";

import { beginPasskeyAuthenticationApi, completePasskeyAuthenticationApi } from "../../api/passkeys_api";
import { getCurrentUserApi } from "../../api/auth_api";
import { extractApiErrorMessage } from "../../api/apiError";
import { queryClient } from "../../core/queryClient";
import { useAuthStore } from "../../store/authStore";
import { SESSIONS_QUERY_KEY } from "../../active_sessions/useSessionsQuery";
import { MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY } from "../../audit_log/authorization_log/authorizationLogQueries";
import { MY_SECURITY_AUDIT_LOG_QUERY_KEY } from "../../audit_log/security_log/securityLogQueries";
import { MY_POLICIES_QUERY_KEY } from "../../policies/queries/policyQueries";
import { CURRENT_USER_QUERY_KEY } from "../current_user/useCurrentUserQuery";
import type { CurrentUserProfile } from "../current_user/current_user_types";

export function usePasskeyLoginMutation() {
    return useMutation<CurrentUserProfile, Error>({
        mutationFn: async () => {
            try {
                await queryClient.cancelQueries({ queryKey: CURRENT_USER_QUERY_KEY });
                const options = await beginPasskeyAuthenticationApi();
                const credential = await startAuthentication({ optionsJSON: options.data });
                await completePasskeyAuthenticationApi(credential);
                return (await getCurrentUserApi("usePasskeyLoginMutation")).data as CurrentUserProfile;
            } catch (error) {
                throw new Error(extractApiErrorMessage(error, "Passkey sign-in failed"), { cause: error });
            }
        },
        onSuccess: (profile) => {
            useAuthStore.getState().setProfile(profile);
            useAuthStore.getState().setAuthenticated(true);
            queryClient.setQueryData(CURRENT_USER_QUERY_KEY, profile);
            queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: MY_POLICIES_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: MY_AUTHORIZATION_AUDIT_LOG_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: MY_SECURITY_AUDIT_LOG_QUERY_KEY });
        },
    });
}
