// Tracks whether THIS tab just granted or revoked a policy/permission on its own
// account (single or bulk dialogs, when the caller's email is a target).
//
// Why: the backend's "permissions_changed" SSE event looks the same whether
// this tab or another session caused it. useSessionEventsStream.ts zeroes the
// permissions list on it so a tab that really lost access fails closed. Doing
// that for this tab's own change would briefly zero a permission the route
// still holds, and ProtectedRoute would bounce to /dashboard before the
// refetch corrects it. This tab already knows the outcome from its mutation
// response, and a real self-triggered loss is still caught when
// CURRENT_USER_QUERY_KEY's invalidation resolves.
//
// The flag is also consumed on first read: the event carries no detail, so the
// time window alone would swallow unrelated events inside it. Clearing after
// one check limits the exposure to one skipped event per self-mutation.
let lastSelfMutationAt: number | null = null;

// Long enough for the SSE echo of this tab's own change to arrive, short enough
// not to swallow an unrelated revoke (single-use consumption bounds it further).
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
