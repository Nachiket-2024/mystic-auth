import React, { Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router";

// LoginPage is loaded eagerly since it's the most common entry point for an
// unauthenticated visitor, so it shouldn't show a loading flash of its own
// on top of App's own session-check gate. Every other route is route-level
// code-split via React.lazy: none of them are needed until their route is
// actually visited, and splitting them keeps the initial bundle (and every
// unauthenticated visitor's download) limited to auth + the app shell.
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
const RateLimitsPage = trackedLazy(() => import("../mystic_auth/rate_limits/RateLimitsPage"));
const AuditLogPage = trackedLazy(() => import("../mystic_auth/audit_log/AuditLogPage"));
const AccountSettingsPage = trackedLazy(() => import("../mystic_auth/account_settings/AccountSettingsPage"));
const NotFoundPage = trackedLazy(() => import("../mystic_auth/status_pages/NotFoundPage"));
const NotAuthorizedPage = trackedLazy(() => import("../mystic_auth/status_pages/NotAuthorizedPage"));
const PrivacyPolicyPage = trackedLazy(() => import("../mystic_auth/legal/PrivacyPolicyPage"));
const TermsOfServicePage = trackedLazy(() => import("../mystic_auth/legal/TermsOfServicePage"));

// Runs the current-user query once and mirrors it into the Zustand auth
// store (see its own docstring for why this must be called exactly once,
// here at the app root), not re-exported from sdk.ts since it's meant to
// be called exactly once, here, not from arbitrary feature code.
import { useAuthSession } from "../mystic_auth/auth/current_user/useCurrentUserQuery";
// Real-time push for cross-tab/cross-device session revocation - same
// "call exactly once, at the app root" reasoning as useAuthSession above.
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

    // Cmd+K / Ctrl+K quick-jump palette: a single listener mounted once here
    // at the app root (rather than inside CommandPalette itself) so it's
    // obvious from this file alone that the shortcut is global, not scoped
    // to whichever page happens to be on screen. Ignored while unauthenticated
    // since every palette destination is itself a protected route.
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

    // Passed to every AppLayout below (same reference each render) so
    // Navbar's visible search-bar trigger opens the identical palette
    // instance the keydown listener above toggles.
    const openCommandPalette = () => setIsPaletteOpen(true);

    // isAuthenticated is null until the session check resolves; showing a
    // loading screen until then avoids a flash of unauthenticated content.
    if (isAuthenticated === null) {
        return <LoadingState message="Checking session..." fullScreen />;
    }

    return (
        <Router>
            {/* Toast queue renderer, mounted once at the app root (uses a
                Portal internally, so placement here doesn't affect layout) */}
            <Toaster />

            {/* Top-of-viewport loading bar, mounted once at the app root so
                it overlays whatever page is currently on screen during a
                route-level code-split navigation, instead of the Suspense
                fallback below blanking it. */}
            <RouteProgressBar />

            {/* Fixed bottom banner reflecting networkStatusStore's isOnline
                flag, mounted once at the app root so it's visible regardless
                of which page/dialog is currently on screen. */}
            <OfflineBanner />

            <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />

            {/* react-router's declarative Router already wraps its own
                location-state updates in React.startTransition, so a
                client-side navigation to a not-yet-loaded lazy route keeps
                the outgoing page on screen and defers rather than triggering
                this boundary's fallback - RouteProgressBar above is what
                actually signals the pending chunk load. This fallback only
                matters for edge cases transition deferral doesn't cover
                (e.g. a lazy route suspending on first paint, before any
                transition exists to defer) - RouteSkeleton keeps that case
                from reading as a hard blank cut. RouteFadeIn below fades
                each route's content in on every navigation, not just this
                fallback case. */}
            <RouteFadeIn>
            <Suspense fallback={<RouteSkeleton />}>
            <Routes>
                {/* Protected routes require authentication. Each is wrapped
                    in AppLayout (sidebar + top bar) inside ProtectedRoute, so
                    the shell only ever renders once access has actually been
                    confirmed.

                    Adding your own feature routes? Give AppLayout an
                    `extraNavItems` prop (same NavItem shape as sdk.ts's
                    NavItem, e.g. `[{ label: "Projects", to: "/projects",
                    permission: APP_PERMISSIONS.PROJECTS_READ }]`) instead of
                    editing mystic_auth/layout/app_layout/navItems.ts, since that file stays
                    upstream-owned. Define the array once above this Routes
                    block and pass the same reference to every AppLayout
                    usage, so the sidebar doesn't reshape as the user
                    navigates. Pass that same array to the CommandPalette
                    instance below via its own `extraNavItems` prop too (plus
                    `extraSearchItems`, SearchItem shape, for content within
                    your own pages), so the palette's search matches what the
                    sidebar shows. See
                    docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points. */}
                {/* "/" is the pre-auth landing page (see
                    app/landing_page/LandingPage.tsx), not a redirect straight into
                    the app - it self-redirects an already-signed-in visitor
                    to /dashboard instead, so the Sidebar's active-item
                    highlight only ever has to match routes that actually
                    render the app shell. */}
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
                        <ProtectedRoute permission={PERMISSIONS.POLICIES_READ}>
                            <AppLayout onOpenCommandPalette={openCommandPalette}>
                                <PoliciesPage />
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
                        // their own audit trail (see AuditLogPage's docstring
                        // for how the "All users" tab is gated separately).
                        // Added your own PBAC resource types/actions? Pass
                        // AuditLogPage `extraResourceTypes`/`extraActions`
                        // (string[]) instead of hand-editing
                        // authorizationLogResourceTypes.ts. See
                        // docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points.
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