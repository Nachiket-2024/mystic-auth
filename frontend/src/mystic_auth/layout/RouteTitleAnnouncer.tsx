import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

import { APP_NAME } from "../core/settings";

const TITLE_SEPARATOR = " | ";

function titleFromPage(): string {
    const heading = document.querySelector("h1")?.textContent?.trim();
    return heading ? `${heading}${TITLE_SEPARATOR}${APP_NAME}` : APP_NAME;
}

/**
 * Keeps the tab title in step with the page and tells screen readers when the
 * route changes. A single-page app never reloads, so without this the title
 * stays "MysticAuth" on every page and a screen reader says nothing after a
 * link is activated.
 *
 * The title is taken from the page's own h1 (every page has exactly one), so
 * no page needs to set it by hand, and a state change that swaps the h1 (for
 * example signup's "Check your email" screen) updates it too. The change is
 * announced politely after navigation only, never on first load.
 */
const RouteTitleAnnouncer: React.FC = () => {
    const { pathname } = useLocation();
    const [announcement, setAnnouncement] = useState("");
    const firstRender = useRef(true);

    useEffect(() => {
        let frame = 0;
        const apply = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const next = titleFromPage();
                if (document.title !== next) document.title = next;
            });
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        // Lazy pages render after the route changes; wait for the title to catch up.
        const timer = window.setTimeout(() => setAnnouncement(titleFromPage()), 400);
        return () => window.clearTimeout(timer);
    }, [pathname]);

    return (
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {announcement}
        </div>
    );
};

export default RouteTitleAnnouncer;
