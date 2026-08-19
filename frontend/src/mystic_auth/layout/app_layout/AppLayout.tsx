import React, { useEffect, useState } from "react";
import { Box, Flex } from "@chakra-ui/react";

import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import type { NavItem } from "./navItems";
import { useScrollToHash } from "../../ui/hooks/useScrollToHash";

interface AppLayoutProps {
    children: React.ReactNode;
    /**
     * Sidebar links for your own feature routes, appended after the
     * built-in ones (see navItems.ts's NAV_ITEMS). This is the supported way
     * to extend the sidebar: never hand-edit navItems.ts itself, that file
     * is upstream-owned. Pass the same array on every route (e.g. define it
     * once in App.tsx and reuse it) so the sidebar doesn't change shape as
     * the user navigates. See
     * docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points.
     */
    extraNavItems?: NavItem[];
    /**
     * App-supplied content for the top bar's action cluster (buttons, icons,
     * links, ...), rendered to the left of ThemeToggle/LogoutButton. See
     * Navbar's own docstring for why this is a free-form ReactNode slot
     * rather than an item list like `extraNavItems`. Pass the same node (or
     * element) on every route the same way you would `extraNavItems`, so the
     * top bar doesn't reshape as the user navigates. See
     * docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points.
     */
    extraNavbarContent?: React.ReactNode;
    /**
     * Opens the Cmd+K/Ctrl+K command palette (App.tsx owns the palette's own
     * open/close state and the global keydown listener; this just gives
     * Navbar's visible search-bar trigger something to call). Optional so a
     * caller that hasn't wired the palette up yet simply doesn't render the
     * trigger, same "omit for no change" shape as the other extension props
     * here.
     */
    onOpenCommandPalette?: () => void;
}

/**
 * Shared shell (sidebar + top bar) for every authenticated page. Wraps a
 * page's content the same way ProtectedRoute wraps its access check: a
 * page component itself stays focused on its own content, not layout
 * chrome.
 */
const AppLayout: React.FC<AppLayoutProps> = ({ children, extraNavItems, extraNavbarContent, onOpenCommandPalette }) => {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    // Mounted once here so every protected page gets #hash deep-linking for
    // free (e.g. CommandPalette's "Manage Sessions" content-search result
    // navigates to /dashboard#manage-sessions) without each page having to
    // remember to call it itself.
    useScrollToHash();

    // Escape closes the off-canvas nav, same as clicking the backdrop:
    // keyboard users shouldn't need a pointer to dismiss it.
    useEffect(() => {
        if (!mobileNavOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMobileNavOpen(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [mobileNavOpen]);

    return (
        <Flex
            minH="100vh"
            bg="bg.canvas"
            // Very soft top-of-viewport tint fading into the flat bg.canvas
            // color (see that token's own comment in theme/system.ts) - cheap
            // CSS-only depth on what would otherwise be a single hard flat
            // fill behind every page's cards/tables.
            bgGradient="to-b"
            gradientFrom="bg.canvasFrom"
            gradientTo="bg.canvasTo"
        >
            <Sidebar isOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} extraItems={extraNavItems} />

            {/* Backdrop for the off-canvas sidebar on small screens */}
            {mobileNavOpen && (
                <Box
                    position="fixed"
                    inset={0}
                    bg="blackAlpha.600"
                    zIndex="overlay"
                    display={{ base: "block", md: "none" }}
                    onClick={() => setMobileNavOpen(false)}
                    aria-hidden="true"
                    data-testid="mobile-nav-backdrop"
                />
            )}

            <Flex direction="column" flex="1" minW={0}>
                <Navbar
                    onToggleSidebar={() => setMobileNavOpen((open) => !open)}
                    extraContent={extraNavbarContent}
                    onOpenCommandPalette={onOpenCommandPalette}
                />
                <Box as="main" flex="1" minW={0} p={{ base: 4, md: 8 }} w="full">
                    {children}
                </Box>
            </Flex>
        </Flex>
    );
};

export default AppLayout;
