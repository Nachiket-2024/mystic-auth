import React, { useEffect, useState } from "react";
import { Box, Flex } from "@chakra-ui/react";

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
     * docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points.
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
        <Flex
            minH="100vh"
            bg="bg.canvas"
            // Soft top-of-viewport tint over the flat bg.canvas color (see
            // theme/system.ts) for cheap CSS-only depth.
            bgGradient="to-b"
            gradientFrom="bg.canvasFrom"
            gradientTo="bg.canvasTo"
        >
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

            <Sidebar isOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} extraItems={extraNavItems} />

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
