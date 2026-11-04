import React, { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useAuthStore } from "../../store/authStore";

// theme/tailwind-tokens.css's --duration-fast/--easing-hover (same tier
// StatTile/PasswordStrengthPanel use), so "how snappy the app feels" stays
// retunable from one place.
const ROUTE_FADE_TRANSITION = "opacity var(--duration-fast) var(--easing-hover)";

/**
 * Fades each route's content in on a client-side navigation instead of a hard
 * cut. Re-triggers on every pathname change after the first: starts at opacity
 * 0, then flips to 1 on the next animation frame so the CSS transition runs.
 * Plain CSS, no animation library; see App.tsx for where it wraps `<Routes>`.
 *
 * Skipped on the very first render (isInitialRender): that is the boot-shell
 * handoff, not a route change, and fading in on top of it looked like two
 * loading screens. The first paint renders at opacity 1.
 */
const RouteFadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { pathname } = useLocation();
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const [visible, setVisible] = useState(true);
    const [isInitialRender, setIsInitialRender] = useState(true);

    // The opacity-0 reset happens during render (same "adjust during
    // render" pattern PolicyFormDialog.tsx uses) - only the rAF scheduling
    // (genuinely async, browser-timed) belongs in the effect.
    const [prevPathname, setPrevPathname] = useState(pathname);
    if (pathname !== prevPathname) {
        setPrevPathname(pathname);
        setIsInitialRender(false);
        setVisible(false);
    }

    useEffect(() => {
        const releaseBootShell = () => {
            const routeContent = document.querySelector('[data-route-content="true"]');
            if (!routeContent?.firstElementChild) return false;
            document.getElementById("boot-shell")?.remove();
            return true;
        };
        let observer: MutationObserver | undefined;
        const frame = requestAnimationFrame(() => {
            setVisible(true);
            // An authenticated visitor briefly reaches /login before the
            // login page redirects to /dashboard. Keep the boot surface over
            // that redirect so the later dashboard route can provide the
            // first measured content instead of exposing a late greeting.
            if (pathname !== "/login" || isAuthenticated === false) {
                if (!releaseBootShell()) {
                    observer = new MutationObserver(() => {
                        if (releaseBootShell()) observer?.disconnect();
                    });
                    observer.observe(document.getElementById("root") ?? document.body, { childList: true, subtree: true });
                }
            }
        });
        return () => {
            cancelAnimationFrame(frame);
            observer?.disconnect();
        };
    }, [isAuthenticated, pathname]);

    return (
        <div
            data-route-content="true"
            style={
                isInitialRender
                    ? undefined
                    : { opacity: visible ? 1 : 0, transition: ROUTE_FADE_TRANSITION }
            }
        >
            {children}
        </div>
    );
};

export default RouteFadeIn;
