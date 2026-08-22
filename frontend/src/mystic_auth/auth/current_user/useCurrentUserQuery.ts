import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { getCurrentUserApi } from "../../api/auth_api";
import { useAuthStore } from "../../store/authStore";
import { useAppearanceStore } from "../../store/appearanceStore";
import type { CurrentUserProfile } from "./current_user_types";

// Shared across this hook, every mutation hook that needs to invalidate/
// refresh the session, and setupAuthInterceptor.ts, keep them all
// referencing this constant rather than repeating the literal array.
export const CURRENT_USER_QUERY_KEY = ["currentUser"] as const;

// This query is mounted once at the app root and never remounts on route
// navigation, so a tab with everything already cached could go a while
// showing "signed in" after being revoked elsewhere without ever issuing a
// request that would surface the resulting 401.
//
// useSessionEventsStream.ts (SSE) is the primary way a tab notices this now,
// within milliseconds; this poll is just the fallback for a silently dropped
// connection, so 2 minutes is fine and keeps idle background traffic low.
const REVALIDATE_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Fetches GET /auth/me. A 401 (no valid session) is the normal, expected
 * "logged out" outcome, not a retryable failure: retry is disabled
 * app-wide on the shared queryClient (see core/queryClient.ts).
 */
export function useCurrentUserQuery() {
    return useQuery({
        queryKey: CURRENT_USER_QUERY_KEY,
        queryFn: async () => {
            const res = await getCurrentUserApi("useCurrentUserQuery");
            return res.data as CurrentUserProfile;
        },
        // refetchIntervalInBackground: this is specifically the query that
        // needs to notice a revocation even in a tab the user has switched
        // away from, not just the one they're actively looking at.
        refetchInterval: REVALIDATE_INTERVAL_MS,
        refetchIntervalInBackground: true,
    });
}

/**
 * Runs the current-user query and mirrors its result into the Zustand auth
 * store. Call this ONCE, at the app root (see App.tsx): every other
 * component reads auth state from useAuthStore, not from this hook directly,
 * so a second call here would just be a redundant subscription to the same
 * query cache entry.
 */
export function useAuthSession(): void {
    const { data, isSuccess, isError } = useCurrentUserQuery();
    const setProfile = useAuthStore((s) => s.setProfile);
    const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
    const clearProfile = useAuthStore((s) => s.clearProfile);

    useEffect(() => {
        if (isSuccess && data) {
            setProfile(data);
            setAuthenticated(true);
            // The server's values win once known, overriding whatever
            // appearanceStore's own localStorage-cached guesses applied
            // eagerly at module load (e.g. after picking colors on
            // another device, or on a browser that never set any locally).
            const appearance = useAppearanceStore.getState();
            appearance.setBrandColor(data.brand_color ?? null);
        } else if (isError) {
            clearProfile();
            setAuthenticated(false);
            const appearance = useAppearanceStore.getState();
            appearance.setBrandColor(null);
        }
    }, [isSuccess, isError, data, setProfile, setAuthenticated, clearProfile]);
}
