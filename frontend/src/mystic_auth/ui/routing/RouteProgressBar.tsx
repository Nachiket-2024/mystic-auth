import React from "react";
import { Box } from "@chakra-ui/react";

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
 * (see trackedLazy.ts/routeLoadingStore.ts) - overlays whatever page is
 * currently on screen instead of the old full-screen Suspense fallback
 * that used to blank the app on every route-level code-split navigation.
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
            <Box
                position="fixed"
                top={0}
                left={0}
                right={0}
                height="1"
                zIndex="max"
                overflow="hidden"
                pointerEvents="none"
                role="progressbar"
                aria-label="Loading"
                aria-valuetext="Loading"
            >
                <Box
                    position="absolute"
                    top={0}
                    left={0}
                    height="full"
                    w="40%"
                    bg="brand.solid"
                    boxShadow="0 0 8px 1px var(--chakra-colors-brand-solid)"
                    // Left un-tokenized on purpose: this is a continuous
                    // indeterminate-loading loop, not a UI response speed
                    // like the durations.hover/fast/base tiers (theme/
                    // system.ts) - retuning "how snappy the app feels"
                    // shouldn't also change how fast this loop cycles.
                    animation="mystic-route-progress-slide 1.1s ease-in-out infinite"
                />
            </Box>
        </>
    );
};

export default RouteProgressBar;
