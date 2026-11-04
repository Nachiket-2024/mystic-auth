// Tracks whether a request that rotates the current session's cookies (today only
// the "set/change password" PUT /users/me, see useUpdateMyAccountMutation.ts) is in
// flight.
//
// Why: that endpoint bumps the account's Valkey version (invalidating every token,
// including this device's) before returning fresh cookies. Meanwhile any other
// in-flight request with the old cookies can 401 and fail its silent refresh too,
// because the old refresh cookie's account_ver is stale until the Set-Cookie headers
// land. Without this guard, setupAuthInterceptor.ts would treat that timing loss as
// a real session death and show "Your session has expired".
//
// Deliberately narrow: only gates the interceptor's last-resort fallback, never
// suppresses a genuinely terminal 401. Once the tracked request settles (plus a short
// grace window below), a still-failing refresh is treated as real.
let pendingRotation: Promise<unknown> | null = null;
let rotationSettledAt: number | null = null;

// The rotating request settling only means ITS OWN Set-Cookie headers landed, not that
// every other request in flight with the old cookies has finished. Such a straggler's
// 401 can still arrive a few ticks later from network/scheduling jitter. Without this
// grace window it would be treated as "session expired" even though a plain retry
// (cookies are already fresh) would have succeeded.
const RECENTLY_ROTATED_GRACE_MS = 3000;

export function trackSessionRotatingRequest<T>(request: Promise<T>): Promise<T> {
    const tracked = request.catch(() => undefined);
    pendingRotation = tracked;
    tracked.finally(() => {
        if (pendingRotation === tracked) pendingRotation = null;
        rotationSettledAt = Date.now();
    });
    return request;
}

export function getPendingSessionRotation(): Promise<unknown> | null {
    return pendingRotation;
}

/** True while a rotation is in flight, or settled recently enough that a
 * fresh 401 might just be a straggler request that lost the race against
 * it (see RECENTLY_ROTATED_GRACE_MS above). */
export function wasSessionRecentlyRotated(): boolean {
    if (pendingRotation) return true;
    return rotationSettledAt !== null && Date.now() - rotationSettledAt < RECENTLY_ROTATED_GRACE_MS;
}

/** Test-only: clears tracked rotation state between test cases so one
 * test's tracked rotation can't leak its grace window into the next. */
export function resetSessionRotationGuardForTests(): void {
    pendingRotation = null;
    rotationSettledAt = null;
}
