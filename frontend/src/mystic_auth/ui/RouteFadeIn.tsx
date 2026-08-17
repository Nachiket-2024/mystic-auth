import React, { useEffect, useState } from "react";
import { useLocation } from "react-router";

// Sourced from theme/system.ts's durations.fast/easings.hover tokens (same
// 0.15s tier StatTile/PasswordStrengthMeter use) rather than its own
// hardcoded literal, so "how snappy the whole app feels" is retunable from
// app/theme.ts in one place instead of piecemeal per component.
const ROUTE_FADE_TRANSITION = "opacity var(--chakra-durations-fast) var(--chakra-easings-hover)";

/**
 * Fades each route's content in on navigation instead of the hard cut a bare
 * `<Routes>` produces. Re-triggers on every pathname change: starts at
 * opacity 0, then flips to 1 on the next animation frame so the browser
 * actually applies the CSS transition instead of skipping straight to the
 * end state. Plain CSS, no animation library - see App.tsx for where this
 * wraps `<Routes>`.
 */
const RouteFadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { pathname } = useLocation();
    const [visible, setVisible] = useState(false);

    // The opacity-0 reset happens during render (React's documented pattern
    // for state derived from props, same "adjust during render" pattern
    // PolicyFormDialog.tsx uses), not as a synchronous setState at the top
    // of the effect below - only the rAF scheduling (genuinely async,
    // browser-timed) belongs in the effect.
    const [prevPathname, setPrevPathname] = useState(pathname);
    if (pathname !== prevPathname) {
        setPrevPathname(pathname);
        setVisible(false);
    }

    useEffect(() => {
        const frame = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(frame);
    }, [pathname]);

    return (
        <div
            style={{
                opacity: visible ? 1 : 0,
                transition: ROUTE_FADE_TRANSITION,
            }}
        >
            {children}
        </div>
    );
};

export default RouteFadeIn;
