import React, { Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router";

// LoginPage loads eagerly since it's the most common entry point for an
// unauthenticated visitor and shouldn't flash on top of the session-check
// gate below. Every other route is lazy-loaded so the initial bundle stays
// limited to auth + the app shell.
import LoginPage from "../mystic_auth/auth/login/LoginPage";
import { trackedLazy } from "../mystic_auth/ui/routing/trackedLazy";
const LandingPage = trackedLazy(() => import("./landing_page/LandingPage"));
const SignupPage = trackedLazy(() => import("../mystic_auth/auth/signup/SignupPage"));
const VerifyAccountPage = trackedLazy(() => import("../mystic_auth/auth/verify_account/VerifyAccountPage"));
const PasswordResetRequestPage = trackedLazy(() => import("../mystic_auth/auth/password_reset_request/PasswordResetRequestPage"));
const PasswordResetConfirmPage = trackedLazy(() => import("../mystic_auth/auth/password_reset_confirm/PasswordResetConfirmPage"));
const ConfirmDeleteAccountPage = trackedLazy(() => import("../mystic_auth/account_settings/confirm_delete/ConfirmDeleteAccountPage"));
const DashboardPage = trackedLazy(() => import("../mystic_auth/dashboard/DashboardPage"));
const UsersPage = trackedLazy(() => import("../mystic_auth/users/UsersPage"));
const PoliciesPage = trackedLazy(() => import("../mystic_auth/policies/PoliciesPage"));
const PermissionsPage = trackedLazy(() => import("../mystic_auth/permissions/PermissionsPage"));
const RateLimitsPage = trackedLazy(() => import("../mystic_auth/rate_limits/RateLimitsPage"));
const AuditLogPage = trackedLazy(() => import("../mystic_auth/audit_log/AuditLogPage"));
const AccountSettingsPage = trackedLazy(() => import("../mystic_auth/account_settings/AccountSettingsPage"));
const NotFoundPage = trackedLazy(() => import("./status_pages/NotFoundPage"));
const NotAuthorizedPage = trackedLazy(() => import("./status_pages/NotAuthorizedPage"));
const PrivacyPolicyPage = trackedLazy(() => import("./legal/PrivacyPolicyPage"));
const TermsOfServicePage = trackedLazy(() => import("./legal/TermsOfServicePage"));

// Runs the current-user query once and mirrors it into the Zustand auth
// store. Not re-exported from sdk.ts since it must only be called here,
// at the app root, not from arbitrary feature code.
import { useAuthSession } from "../mystic_auth/auth/current_user/useCurrentUserQuery";
// Real-time push for cross-tab/cross-device session revocation. Same
// "call once, at the app root" reasoning as useAuthSession above.
import { useSessionEventsStream } from "../mystic_auth/auth/session_lifecycle/useSessionEventsStream";

import { AppLayout, ProtectedRoute, PERMISSIONS, Toaster, useAuthStore, LoadingState, CommandPalette } from "./sdk";
import RouteProgressBar from "../mystic_auth/ui/routing/RouteProgressBar";
import RouteSkeleton from "../mystic_auth/ui/routing/RouteSkeleton";
import RouteFadeIn from "../mystic_auth/ui/routing/RouteFadeIn";
import OfflineBanner from "../mystic_auth/ui/network/OfflineBanner";

const App: React.FC = () => {
    useAuthSession();
    useSessionEventsStream();

    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    // Cmd+K / Ctrl+K quick-jump palette. Listener lives here (not inside
    // CommandPalette) so the shortcut is clearly global. Ignored while
    // unauthenticated since every palette destination is a protected route.
    const [isPaletteOpen, setIsPaletteOpen] = useState(false);
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isAuthenticated) return;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setIsPaletteOpen((open) => !open);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isAuthenticated]);

    // Passed to every AppLayout below so Navbar's search-bar trigger opens
    // the same palette instance the keydown listener above toggles.
    const openCommandPalette = () => setIsPaletteOpen(true);

    // isAuthenticated is null until the session check resolves; showing a
    // loading screen until then avoids a flash of unauthenticated content.
    if (isAuthenticated === null) {
        return <LoadingState message="Checking session..." fullScreen />;
    }

    return (
        <Router>
            {/* Toast queue renderer (uses a Portal, so placement here doesn't affect layout) */}
            <Toaster />

            {/* Top-of-viewport loading bar. Mounted here so it overlays the
                current page during a lazy-route navigation instead of the
                Suspense fallback below blanking it. */}
            <RouteProgressBar />

            {/* Fixed bottom banner reflecting networkStatusStore's isOnline
                flag, visible regardless of which page/dialog is on screen. */}
            <OfflineBanner />

            <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />

            {/* react-router wraps navigation in React.startTransition, so a
                click to a not-yet-loaded lazy route defers instead of
                triggering this Suspense fallback (RouteProgressBar above
                signals that pending load instead). This fallback only
                matters for edge cases transition deferral misses, like a
                lazy route suspending on first paint; RouteSkeleton keeps
                that from reading as a blank cut. RouteFadeIn fades in every
                route's content, not just this fallback case. */}
            <RouteFadeIn>
            <Suspense fallback={<RouteSkeleton />}>
            <Routes>
                {/* Protected routes require authentication. Each wraps
                    AppLayout (sidebar + top bar) inside ProtectedRoute, so
                    the shell only renders once access is confirmed.

                    Adding your own feature routes? Give AppLayout an
                    `extraNavItems` prop (NavItem shape from sdk.ts, e.g.
                    `[{ label: "Projects", to: "/projects", permission:
                    APP_PERMISSIONS.PROJECTS_READ }]`) instead of editing the
                    upstream-owned mystic_auth/layout/app_layout/navItems.ts.
                    Define the array once above this Routes block and reuse
                    the same reference on every AppLayout usage, so the
                    sidebar doesn't reshape while navigating. Pass it to
                    CommandPalette too (plus `extraSearchItems` for
                    in-page content) so palette search matches the sidebar.
                    See docs/mystic_auth/template-usage/frontend-customization.md#shared-chrome-extension-points. */}
                {/* "/" is the pre-auth landing page, not a redirect into the
                    app - it self-redirects an already-signed-in visitor to
                    /dashboard, so Sidebar's active-item highlight only ever
                    has to match routes that render the app shell. */}
                <Route path="/" element={<LandingPage />} />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <AppLayout onOpenCommandPalette={openCommandPalette}>
                                <DashboardPage />
                            </AppLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/users"
                    element={
                        <ProtectedRoute permission={PERMISSIONS.USERS_LIST_ALL}>
                            <AppLayout onOpenCommandPalette={openCommandPalette}>
                                <UsersPage />
                            </AppLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/policies"
                    element={
                        // Any of read/create, not read alone - see
                        // navItems.ts's matching Policies entry for why.
                        <ProtectedRoute permission={[PERMISSIONS.POLICIES_READ, PERMISSIONS.POLICIES_CREATE]}>
                            <AppLayout onOpenCommandPalette={openCommandPalette}>
                                <PoliciesPage />
                            </AppLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/permissions"
                    element={
                        <ProtectedRoute permission={PERMISSIONS.PERMISSIONS_READ}>
                            <AppLayout onOpenCommandPalette={openCommandPalette}>
                                <PermissionsPage />
                            </AppLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/rate-limits"
                    element={
                        <ProtectedRoute permission={PERMISSIONS.RATE_LIMITS_READ}>
                            <AppLayout onOpenCommandPalette={openCommandPalette}>
                                <RateLimitsPage />
                            </AppLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/audit-log"
                    element={
                        // No permission prop: every authenticated user can see
                        // their own audit trail (the "All users" tab is gated
                        // separately, see AuditLogPage). Added your own PBAC
                        // resource types/actions? Pass AuditLogPage
                        // `extraResourceTypes`/`extraActions` instead of
                        // hand-editing authorizationLogResourceTypes.ts.
                        <ProtectedRoute>
                            <AppLayout onOpenCommandPalette={openCommandPalette}>
                                <AuditLogPage />
                            </AppLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/account-settings"
                    element={
                        <ProtectedRoute>
                            <AppLayout onOpenCommandPalette={openCommandPalette}>
                                <AccountSettingsPage />
                            </AppLayout>
                        </ProtectedRoute>
                    }
                />

                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/verify-account" element={<VerifyAccountPage />} />
                <Route path="/password-reset-request" element={<PasswordResetRequestPage />} />

                {/* Matches backend email link format */}
                <Route path="/reset-password" element={<PasswordResetConfirmPage />} />

                {/* Matches account_deletion_service.py's deletion_url */}
                <Route path="/confirm-delete" element={<ConfirmDeleteAccountPage />} />

                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsOfServicePage />} />

                {/* Where ProtectedRoute sends an authenticated user who lacks
                    a route's required permission */}
                <Route path="/not-authorized" element={<NotAuthorizedPage />} />

                <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </Suspense>
            </RouteFadeIn>
        </Router>
    );
};

export default App;
