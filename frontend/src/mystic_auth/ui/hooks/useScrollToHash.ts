import { useEffect } from "react";
import { useLocation } from "react-router";

/**
 * Scrolls the element whose `id` matches the current URL's `#hash` into view
 * once it exists. Mounted once in AppLayout; CommandPalette's content search
 * uses it to land on an in-page section via an extraSearchItems `#hash`
 * (no built-in item needs it today).
 *
 * Retries briefly, since the target may still be mounting (lazy route chunk,
 * loading skeleton) when the effect first runs.
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
