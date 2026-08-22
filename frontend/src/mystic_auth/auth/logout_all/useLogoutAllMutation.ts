import { useMutation } from "@tanstack/react-query";

import { logoutAllApi } from "../../api/auth_api";
import { extractApiErrorMessage } from "../../api/apiError";
import { clearMyAccountSessionCaches } from "../session_lifecycle/clearMyAccountSessionCaches";
import type { LogoutResponse } from "../logout/logout_types";

// Same reasoning as useLogoutMutation: setAuthenticated(false), not
// reset() (see that file's comment for why), and cleanup runs in
// onSettled rather than onSuccess - see useLogoutMutation.ts's comment on
// why gating this on success left the user stuck on the page (no
// navigation, no feedback) whenever POST /auth/logout/all 400'd on an
// already-missing refresh_token cookie.
export function useLogoutAllMutation() {
    return useMutation<LogoutResponse, Error, void>({
        mutationFn: async () => {
            try {
                const res = await logoutAllApi();
                return res.data;
            } catch (error) {
                throw new Error(extractApiErrorMessage(error, "Logout all devices failed"), { cause: error });
            }
        },
        onSettled: clearMyAccountSessionCaches,
    });
}
