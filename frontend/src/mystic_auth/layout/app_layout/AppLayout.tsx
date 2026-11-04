import React, { useEffect, useState } from "react";

import SkipLink, { MAIN_CONTENT_ID } from "../SkipLink";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import type { NavItem } from "./navItems";
import { useScrollToHash } from "../../ui/hooks/useScrollToHash";

interface AppLayoutProps {
    children: React.ReactNode;
    /**
     * Extra sidebar links for feature routes, appended after the built-in
     * NAV_ITEMS. Pass the same array on every route so the sidebar doesn't
     * reshape as the user navigates. See
     * docs/mystic_auth/template-usage/frontend-customization.md#shared-chrome-extension-points.
     */
    extraNavItems?: NavItem[];
    /**
     * App-supplied content for the top bar's action cluster, rendered left
     * of ThemeToggle/LogoutButton. Pass the same node on every route so the
     * top bar doesn't reshape as the user navigates.
     */
    extraNavbarContent?: React.ReactNode;
    /**
     * Opens the Cmd+K/Ctrl+K command palette (App.tsx owns open/close state
     * and the global keydown listener). Optional: omit if the palette isn't
     * wired up yet.
     */
    onOpenCommandPalette?: () => void;
}

/** Shared shell (sidebar + top bar) for every authenticated page. */
const AppLayout: React.FC<AppLayoutProps> = ({ children, extraNavItems, extraNavbarContent, onOpenCommandPalette }) => {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    // Mounted once so every protected page gets #hash deep-linking for free
    // (e.g. CommandPalette's "Manage Sessions" result).
    useScrollToHash();

    // Escape closes the off-canvas nav, same as clicking the backdrop.
    useEffect(() => {
        if (!mobileNavOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMobileNavOpen(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [mobileNavOpen]);

    return (
        // Two soft radial brand-tint glows over the flat bg-bg-canvas color (doubled
        // alpha in dark mode), tuned by eye. A linear fade read as a flat band or
        // was invisible. color-mix ties the glow to the live brand-solid token, so it
        // works for any brand color. Light/dark values live in theme/application.css
        // as .mystic-app-layout-bg (one rule guarded by `.dark`), not an inline
        // `style` or runtime `<style>` tag, because a strict hash-only CSP cannot
        // allow one.
        <div className="mystic-app-layout-bg flex min-h-screen bg-bg-canvas bg-fixed">
            <SkipLink />
            {/* Backdrop for the off-canvas sidebar on small screens */}
            {mobileNavOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-[1300] block md:hidden"
                    onClick={() => setMobileNavOpen(false)}
                    aria-hidden="true"
                    data-testid="mobile-nav-backdrop"
                />
            )}

            <Sidebar isOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} extraItems={extraNavItems} />

            <div className="flex flex-col flex-1 min-w-0">
                <Navbar
                    onToggleSidebar={() => setMobileNavOpen((open) => !open)}
                    extraContent={extraNavbarContent}
                    onOpenCommandPalette={onOpenCommandPalette}
                />
                <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 min-w-0 w-full outline-none px-4 py-5 sm:px-6 md:px-8 md:py-7 [scrollbar-gutter:stable]">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AppLayout;
