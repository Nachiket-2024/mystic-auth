/**
 * routePrefetch
 * ----------------------------
 * Maps each built-in NAV_ITEMS path to the same dynamic import() App.tsx
 * already wraps in trackedLazy() for that route. Calling it again here
 * doesn't create a second chunk or a second component instance - Vite/
 * Rollup's module cache means a repeated import() of the same specifier
 * resolves the one chunk it already split out, so this just warms that
 * cache ahead of the actual navigation.
 *
 * Used by Sidebar's hover handler: a user hovering a nav link is very
 * likely about to click it, so kicking off the chunk fetch on hover
 * (rather than waiting for the click -> route change -> Suspense boundary)
 * hides the network round trip behind however long the hover-to-click gap
 * actually is, instead of it showing up as a RouteProgressBar flash after
 * every click.
 *
 * Only covers the built-ins: an app's own `extraNavItems` point at routes
 * this file has no way to know about, so they fall back to the ordinary
 * click-triggered lazy load, same as before this file existed.
 */
const ROUTE_PREFETCH: Record<string, () => Promise<unknown>> = {
    "/dashboard": () => import("../../dashboard/DashboardPage"),
    "/users": () => import("../../users/UsersPage"),
    "/policies": () => import("../../policies/PoliciesPage"),
    "/audit-log": () => import("../../audit_log/AuditLogPage"),
    "/account-settings": () => import("../../account_settings/AccountSettingsPage"),
};

// Once a chunk import has resolved (or is in flight) there's no reason to
// re-trigger it on every subsequent hover of the same link.
const requested = new Set<string>();

export function prefetchRoute(to: string): void {
    if (requested.has(to)) return;
    const load = ROUTE_PREFETCH[to];
    if (!load) return;
    requested.add(to);
    load().catch(() => {
        // A failed prefetch (offline, flaky network) shouldn't be fatal or
        // noisy - the real navigation's own Suspense/error handling covers
        // it properly; allow a later hover to retry.
        requested.delete(to);
    });
}
