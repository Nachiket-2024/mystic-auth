/**
 * selfPermissionMutationGuard
 * ----------------------------
 * Tracks whether THIS tab just granted/revoked a policy or direct permission
 * against its own account (PolicyFormDialog/UserPoliciesDialog/
 * UserPermissionsDialog and their bulk equivalents, whenever the acting
 * admin's own email is among the targets).
 *
 * Why this needs to exist: the backend publishes the same "permissions_changed"
 * SSE event (session_events.py's publish_permissions_changed) whether the
 * change was a grant or a revoke, and whether it came from this tab's own
 * request or a completely different admin/session. useSessionEventsStream.ts
 * reacts to that event by synchronously zeroing the Zustand permissions list
 * (dropPermissions()) so a tab that's genuinely had access pulled out from
 * under it is fail-closed instantly - see that file's own comment. But firing
 * that same synchronous wipe for a change THIS tab just made itself (most
 * commonly: an admin granting themselves a permission from the Users page)
 * momentarily zeroes a permission the route actually still (or now) holds,
 * which ProtectedRoute reads as a live revoke and bounces to /dashboard
 * before the follow-up refetch has a chance to restore the correct list.
 *
 * This tab already knows the true outcome from its own mutation response, so
 * there is nothing for the fail-closed path to protect against here -
 * skipping dropPermissions() for the echo of this tab's own change loses no
 * security guarantee (a genuine self-triggered permission loss, e.g.
 * revoking a policy that also covered `users:manage`, is still caught the
 * instant the mutation's own CURRENT_USER_QUERY_KEY invalidation resolves).
 *
 * Consumed on first read, not just time-windowed: the backend's
 * "permissions_changed" event carries no detail about which permission
 * changed or who changed it (session_events.py), so there is no way to
 * confirm an incoming event actually IS this tab's own echo rather than a
 * coincidentally-timed, genuinely unrelated change from another admin/
 * session. Leaving the window open on a plain elapsed-time check would let
 * every event that lands within it skip the fail-closed drop, not just the
 * one echo it exists to cover - e.g. admin A grants themselves a permission
 * (arming the window), and admin B revokes something unrelated (and more
 * sensitive) from admin A a moment later: without single-use consumption,
 * that second, real revoke would ALSO be swallowed. Clearing the flag after
 * one check bounds the exposure to at most one skipped event per
 * self-mutation, matching the guard's own justification ("the echo of THIS
 * tab's own change"), not an open multi-event amnesty window.
 */
let lastSelfMutationAt: number | null = null;

// Generous enough to cover the round trip from this tab's own mutation
// response to the SSE event for that same change arriving back over the
// wire, without staying armed long enough to also swallow a genuinely
// unrelated revoke from another session that happens to land moments later
// (bounded further by single-use consumption below, not just this window).
const RECENT_SELF_MUTATION_WINDOW_MS = 5000;

export function markSelfPermissionMutation(): void {
    lastSelfMutationAt = Date.now();
}

/** Single-use: the first check after a self-mutation consumes the flag,
 * whether or not it was within the window, so at most one incoming event
 * is ever treated as the self-echo. */
export function wasSelfPermissionMutationRecent(): boolean {
    if (lastSelfMutationAt === null) return false;
    const withinWindow = Date.now() - lastSelfMutationAt < RECENT_SELF_MUTATION_WINDOW_MS;
    lastSelfMutationAt = null;
    return withinWindow;
}

/** Test-only: clears tracked state between test cases. */
export function resetSelfPermissionMutationGuardForTests(): void {
    lastSelfMutationAt = null;
}
