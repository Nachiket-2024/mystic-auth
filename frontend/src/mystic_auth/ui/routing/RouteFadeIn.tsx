import React, { useEffect, useState } from "react";
import { useLocation } from "react-router";

// theme/tailwind.css's --duration-fast/--easing-hover (same tier
// StatTile/PasswordStrengthPanel use), so "how snappy the app feels" stays
// retunable from one place.
const ROUTE_FADE_TRANSITION = "opacity var(--duration-fast) var(--easing-hover)";

/**
 * Fades each route's content in on navigation instead of the hard cut a bare
 * `<Routes>` produces. Re-triggers on every pathname change: starts at
 * opacity 0, then flips to 1 on the next animation frame so the browser
 * applies the CSS transition instead of skipping to the end state. Plain
 * CSS, no animation library - see App.tsx for where this wraps `<Routes>`.
 */
const RouteFadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { pathname } = useLocation();
    const [visible, setVisible] = useState(false);

    // The opacity-0 reset happens during render (same "adjust during
    // render" pattern PolicyFormDialog.tsx uses) - only the rAF scheduling
    // (genuinely async, browser-timed) belongs in the effect.
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
