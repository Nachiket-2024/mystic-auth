import React from "react";

import { useRouteLoadingStore } from "../../store/routeLoadingStore";

const KEYFRAMES = `
@keyframes mystic-route-progress-slide {
    0% { transform: translateX(-100%); }
    60% { transform: translateX(60%); }
    100% { transform: translateX(160%); }
}
`;

/**
 * Thin indeterminate progress bar pinned to the top of the viewport,
 * mounted once at the app root. Shown while a lazy route chunk is loading
 * (trackedLazy.ts/routeLoadingStore.ts) - overlays the current page instead
 * of a full-screen Suspense fallback blanking the app.
 */
const RouteProgressBar: React.FC = () => {
    const isLoading = useRouteLoadingStore((s) => s.pendingCount > 0);

    if (!isLoading) return null;

    return (
        <>
            {/* React 19 hoists/dedupes <style> by href, so this is a no-op
                on re-render rather than re-inserting the rule every time
                the bar toggles visible. */}
            <style href="mystic-route-progress-bar-keyframes" precedence="low">
                {KEYFRAMES}
            </style>
            {/* z-[2147483647]: Chakra's zIndex="max" token value, kept
                exactly so this still overlays literally everything. */}
            <div
                className="fixed top-0 left-0 right-0 h-1 z-[2147483647] overflow-hidden pointer-events-none"
                role="progressbar"
                aria-label="Loading"
                aria-valuetext="Loading"
            >
                <div
                    className="absolute top-0 left-0 h-full w-2/5 bg-brand-solid"
                    style={{
                        boxShadow: "0 0 8px 1px var(--brand-solid)",
                        // Left un-tokenized on purpose: this is a continuous
                        // indeterminate-loading loop, not a UI response speed
                        // like durations.hover/fast/base - retuning "how snappy
                        // the app feels" shouldn't also change this loop's speed.
                        animation: "mystic-route-progress-slide 1.1s ease-in-out infinite",
                    }}
                />
            </div>
        </>
    );
};

export default RouteProgressBar;
