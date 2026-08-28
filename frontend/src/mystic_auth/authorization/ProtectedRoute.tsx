import React, { useState } from "react";
import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";

import { useAuthorization } from "./useAuthorization";
import { useAuthStore } from "../store/authStore";
import LoadingState from "../ui/LoadingState";

interface ProtectedRouteProps {
    children: React.ReactNode;
    // If provided, the caller must also hold this action (via useAuthorization().can) in
    // addition to being authenticated, e.g. permission="policies:read" for a permission-gated route.
    // An array means "any of" - the caller needs at least one, not all of them - for a route
    // that's a legitimate destination for more than one independent action (e.g.
    // permission={[PERMISSIONS.POLICIES_READ, PERMISSIONS.POLICIES_CREATE]}, since a caller who
    // can only create policies still needs to reach this route to do so).
    // Omit for a route that only needs authentication.
    permission?: string | string[];
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
    const permissionsPending = useAuthStore((s) => s.permissionsPending);
    const isAllowed = isAuthenticated === true && (!permission || can(permission, resourceType));

    // wasEverAllowed distinguishes navigating straight to a route you never
    // had permission for (stays false) from a live SSE permissions_changed
    // push (see useSessionEventsStream.ts's dropPermissions()) revoking
    // access from a route that was already open (true by then). Adjusted
    // directly in the render body, not a useEffect, since it's purely
    // derived from `isAllowed` and needs no effect. Both hooks run
    // unconditionally before any early return, so hook order stays stable.
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
        // A permissions_changed push zeroes the whole permission list on
        // principle, even for an unrelated change, so isAllowed can briefly
        // read false here without a genuine revoke. Render a loader instead
        // of navigating until the follow-up GET /auth/me confirms the route
        // is actually still forbidden.
        if (wasEverAllowed && permissionsPending) {
            return <LoadingState message={t("authorization:verifyingSession")} fullScreen />;
        }

        // Confirmed live revoke: go straight home, skip the 403 page (its
        // "you don't have permission" copy would misleadingly suggest a bad
        // direct link). `replace` drops the revoked route from history so
        // Back doesn't bounce off this same check again.
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
