import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton TanStack Query client for all server state in the app. Exported as a module-level
 * singleton (rather than only living inside a component) so code outside the React tree,
 * specifically auth/session_lifecycle/setupAuthInterceptor.ts, which needs to write directly into the
 * ["currentUser"] query cache on an unrecoverable 401, can reach it without a hook.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
            // Default of 0 treats every remount and window refocus as stale,
            // causing duplicate network calls on nearly every navigation
            // (e.g. DashboardPage's useCurrentUserQuery re-hitting GET
            // /auth/me moments after App.tsx's root useAuthSession already
            // had). 30s absorbs those cases while still surfacing another
            // user's change within one page-load.
            staleTime: 30 * 1000,
        },
    },
});
