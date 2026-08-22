import { useEffect } from "react";

import settings from "../../core/settings";
import { queryClient } from "../../core/queryClient";
import { useAuthStore } from "../../store/authStore";
import { CURRENT_USER_QUERY_KEY } from "../current_user/useCurrentUserQuery";
import { SESSIONS_QUERY_KEY } from "../../dashboard/manage_sessions/useSessionsQuery";
import { LAST_LOGIN_QUERY_KEY } from "../../dashboard/useLastLoginQuery";

/**
 * Opens a Server-Sent Events connection to GET /auth/session-events while
 * authenticated, so this tab finds out the instant its session (or a
 * sibling session on the same account) is revoked OR created elsewhere -
 * logout-all, a password change, a targeted Manage Sessions revoke,
 * reuse-detection, a fresh login from another device/tab - OR this account's
 * policies are granted/revoked by an admin elsewhere - instead of waiting
 * on its next background poll (useCurrentUserQuery's and useSessionsQuery's
 * own refetchInterval, kept as a fallback for the rare case this connection
 * silently drops without the browser's native auto-reconnect noticing) or a
 * window-focus refetch.
 *
 * Deliberately reacts by invalidating the existing queries, not by acting
 * on the event's own payload: the event is just a "something changed, go
 * check now" nudge (see backend's user_session/session_events.py), never an
 * authoritative "you are logged out" on its own - only the resulting GET
 * /auth/me actually decides that. This channel is shared by every session
 * on the account, so a sibling session's revoke must never log this one out
 * by itself; it only earns the right to re-check.
 *
 * Call this once, at the app root (see App.tsx), same as useAuthSession.
 */
export function useSessionEventsStream(): void {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    useEffect(() => {
        if (!isAuthenticated) return;

        const source = new EventSource(`${settings.apiBaseUrl}/auth/session-events`, {
            withCredentials: true,
        });

        source.onmessage = (event) => {
            let type: string | undefined;
            try {
                type = (JSON.parse(event.data) as { type?: string }).type;
            } catch {
                // Malformed payload - fall through to the default handling
                // below rather than losing the nudge entirely.
            }

            if (type === "permissions_changed") {
                // Fail closed IMMEDIATELY, synchronously, before any network
                // round-trip: we don't yet know the caller's new permission
                // list at this point, only that it changed, so
                // dropPermissions() zeroes it out in the Zustand store right
                // now. ProtectedRoute/IfCan/the sidebar's nav filter all
                // read permissions reactively from that store, so this
                // alone is enough to instantly redirect a tab sat on a
                // now-forbidden route (ProtectedRoute -> /not-authorized)
                // and hide now-forbidden action buttons/nav items - without
                // waiting on GET /auth/me to complete. Waiting on that
                // round-trip was exactly the gap that let someone stay on a
                // just-revoked page (e.g. RateLimitsPage) and keep filtering
                // to re-trigger fetches: since every one of those pages'
                // query caches also uses placeholderData: keepPreviousData
                // for pagination/filter UX, each new fetch would flash the
                // last cached real data as a placeholder before its 403
                // landed. A route unmounted here can no longer make that
                // request at all - dropping permissions first (not just
                // resetting the query cache after) is what actually closes
                // the window, not merely narrows it.
                useAuthStore.getState().dropPermissions();

                // Follow up with the authoritative refetch: resolves the
                // real permission list (repopulating it if this was a grant,
                // not a revoke) and, via resetQueries (not invalidateQueries),
                // drops every cached query's data outright rather than just
                // marking it stale - so a page that's still reachable (a
                // different, unaffected permission) has nothing leftover to
                // serve as a keepPreviousData placeholder either.
                queryClient.resetQueries();
                return;
            }

            queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: LAST_LOGIN_QUERY_KEY });
        };

        // EventSource retries on its own (browser-native exponential
        // backoff) after a dropped connection - nothing to do here beyond
        // letting errors pass silently rather than surfacing every
        // transient network blip as a user-facing error. The 30s poll
        // fallback covers the gap while a reconnect is in progress.
        source.onerror = () => {};

        return () => source.close();
    }, [isAuthenticated]);
}
