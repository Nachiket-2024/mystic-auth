import React, { useState } from "react";
import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";

import { useAuthorization } from "./useAuthorization";
import LoadingState from "../ui/LoadingState";

interface ProtectedRouteProps {
    children: React.ReactNode;
    // If provided, the caller must also hold this action (via useAuthorization().can) in
    // addition to being authenticated, e.g. permission="policies:read" for a permission-gated route.
    // Omit for a route that only needs authentication.
    permission?: string;
    // Passed through to can() alongside `permission`: see useAuthorization.ts's `can` for why
    // this doesn't currently narrow the check (the cached permissions list has no resource-type
    // dimension of its own).
    resourceType?: string;
}

/**
 * Ensures that child components are only accessible to authenticated users, and, when a
 * `permission` is given, only to callers who currently hold that permission too.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, permission, resourceType }) => {
    const { t } = useTranslation("authorization");
    const { isAuthenticated, can } = useAuthorization();
    const isAllowed = isAuthenticated === true && (!permission || can(permission, resourceType));

    // wasEverAllowed distinguishes two different reasons a render might be
    // denied: navigating straight to a route you never had permission for
    // (wasEverAllowed stays false) versus a live SSE permissions_changed
    // push (see useSessionEventsStream.ts's dropPermissions()) pulling
    // access out from under a route that was already open (wasEverAllowed
    // is true by the time that happens). State, not a ref: this project's
    // lint config (react-hooks/refs) disallows reading ref.current during
    // render at all. Adjusted directly in the render body (the React-
    // documented "adjust state when a prop changes" pattern - see
    // https://react.dev/learn/you-might-not-need-an-effect), not in a
    // useEffect: react-hooks/set-state-in-effect flags a setState call
    // inside an effect body as an avoidable cascading render, and this
    // needs no effect at all since it's purely derived from `isAllowed`,
    // already available during this same render. Both hooks are called
    // unconditionally, before any early return below, so hook order stays
    // identical across every render regardless of which branch this
    // component takes (rules-of-hooks).
    const [prevIsAllowed, setPrevIsAllowed] = useState(isAllowed);
    const [wasEverAllowed, setWasEverAllowed] = useState(isAllowed);
    if (isAllowed !== prevIsAllowed) {
        setPrevIsAllowed(isAllowed);
        if (isAllowed) setWasEverAllowed(true);
    }

    // Show a loader only while authentication status is truly unknown: permissions are
    // populated in the same Zustand store update that sets isAuthenticated=true (see
    // useAuthSession in useCurrentUserQuery.ts), so there's no separate "permissions still
    // loading" gap to handle here. Never render protected (or unauthorized-redirect) content
    // before that's resolved, so there's no flash of either.
    if (isAuthenticated === null) {
        return <LoadingState message={t("authorization:verifyingSession")} fullScreen />;
    }

    if (isAuthenticated === false) {
        // Deliberately no `from`/return-to-previous-page state: every login
        // (whether after an explicit logout, a session that died from under
        // the user, or a fresh unauthenticated visit) lands on /dashboard,
        // never wherever the caller happened to be when they lost their
        // session - LoginPage.tsx always redirects there.
        return <Navigate to="/login" replace />;
    }

    if (!isAllowed) {
        // Live revoke: send straight home with no detour through the 403
        // page. That page's copy ("you don't have permission") reads as if
        // this were a bad direct link, which isn't what happened here, and
        // its own "go home" button would just be one extra click to reach
        // the same place. `replace` means the just-revoked route's history
        // entry is gone entirely, so browser Back from here lands on
        // whatever came before it, not back into another bounce off this
        // same check.
        if (wasEverAllowed) {
            return <Navigate to="/dashboard" replace />;
        }

        // Deliberately NOT /login: the caller IS authenticated, just missing a permission, so
        // sending them back to a login form would be confusing and wouldn't fix anything.
        return <Navigate to="/not-authorized" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
