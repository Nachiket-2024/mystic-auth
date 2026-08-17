import { create } from "zustand";

interface RouteLoadingState {
    /** Count of in-flight lazy route chunk imports, not a boolean: two
     * navigations can race (e.g. a double-click, or clicking a second link
     * before the first chunk finishes), and the bar must stay visible until
     * every one of them has settled, not just the most recent. */
    pendingCount: number;
}

/**
 * Tracks in-flight lazy route chunk loads so RouteProgressBar can show a
 * top-of-viewport progress bar during a route transition, independent of
 * Suspense's own fallback (see trackedLazy.ts for why this is tracked
 * separately instead of relying on the Suspense boundary itself).
 */
export const useRouteLoadingStore = create<RouteLoadingState>(() => ({
    pendingCount: 0,
}));

export function startRouteLoad(): void {
    useRouteLoadingStore.setState((s) => ({ pendingCount: s.pendingCount + 1 }));
}

export function finishRouteLoad(): void {
    useRouteLoadingStore.setState((s) => ({ pendingCount: Math.max(0, s.pendingCount - 1) }));
}
