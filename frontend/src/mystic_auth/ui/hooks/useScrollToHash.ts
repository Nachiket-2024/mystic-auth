import { useEffect } from "react";
import { useLocation } from "react-router";

/**
 * Scrolls the element whose `id` matches the current URL's `#hash` into
 * view once it exists in the DOM. Mounted once in AppLayout (see its own
 * comment) so every page gets this for free - CommandPalette's content
 * search (layout/searchItems.ts) relies on it to land on a specific
 * in-page section (e.g. `/dashboard#manage-sessions`), not just the page
 * top, the same way UsersPage reads `?search=` for its own deep link.
 *
 * Retries briefly instead of running once: the target can still be
 * mounting when this effect first runs (a lazy-loaded route chunk, a
 * loading skeleton ahead of real data), so a single `getElementById` right
 * after navigation would often find nothing.
 */
export function useScrollToHash() {
    const { hash } = useLocation();

    useEffect(() => {
        if (!hash) return;
        const id = decodeURIComponent(hash.slice(1));
        let cancelled = false;
        let attempts = 0;

        const tryScroll = () => {
            if (cancelled) return;
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }
            if (attempts++ < 20) setTimeout(tryScroll, 100);
        };
        tryScroll();

        return () => {
            cancelled = true;
        };
    }, [hash]);
}
