import React, { useState } from "react";
import { Box, HStack, Stack } from "@chakra-ui/react";
import { Link, NavLink } from "react-router";
import type { LucideIcon } from "lucide-react";

import { IfCan } from "../authorization/IfCan";
import { NAV_ITEMS, type NavItem } from "./navItems";
import Logo from "./Logo";
import { useThemeStore } from "../store/themeStore";
import { useLanguageStore } from "../store/languageStore";
import translations from "../translations/translations";
import { prefetchRoute } from "./routePrefetch";
import { FAST_HOVER_TRANSITION } from "../theme/system";

interface SidebarProps {
    isOpen: boolean;
    onNavigate: () => void;
    /**
     * App-supplied links, merged with the built-in ones and sorted by
     * `order` (see NavItem: items without one sort last, in the order
     * given, which is why omitting `order` entirely still reproduces the
     * original append-only behavior). Same NavItem shape and same IfCan
     * gating as the built-ins, see AppLayout's own docstring and
     * docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points.
     * Optional and defaults to none, so existing callers see no change.
     */
    extraItems?: NavItem[];
}

interface SidebarNavLinkProps {
    to: string;
    onClick: () => void;
    label: string;
    icon?: LucideIcon;
}

/**
 * Single nav entry. Needs its own hover flag (rather than a plain CSS
 * `:hover` rule) because NavLink's `style` prop only takes a function of
 * `{ isActive }` - there's no `isHovered` Chakra pseudo-prop equivalent
 * available here without introducing a stylesheet, so hover is tracked the
 * same way `isActive` already drives color/background below.
 */
const SidebarNavLink: React.FC<SidebarNavLinkProps> = ({ to, onClick, label, icon: Icon }) => {
    const [isHovered, setIsHovered] = useState(false);
    const isDark = useThemeStore((s) => s.colorMode === "dark");

    // Raw brand scale steps, not the shared brand.subtle/selected tokens:
    // those read as barely-there (brand.50/100) against the sidebar's white
    // bg.surface, so hover/active go one step further along the scale
    // without touching the shared tokens' other consumers. NavLink's style
    // prop can't consume Chakra's _dark condition (CSS-selector-based, not
    // inline styles), hence reading colorMode directly. Dark mode's scale
    // runs the opposite direction: a lower number is brighter, so hover
    // (less emphasis than active) takes the higher, closer-to-background
    // number - same brand.900/800 pairing system.ts's subtle/selected use.
    const hoverBg = isDark ? "var(--chakra-colors-brand-900)" : "var(--chakra-colors-brand-100)";
    const activeBg = isDark ? "var(--chakra-colors-brand-800)" : "var(--chakra-colors-brand-200)";
    // brand.fg (brand.600) against this light-mode activeBg (brand.200)
    // measured 3.41:1 - under WCAG AA's 4.5:1 (axe-core color-contrast
    // audit): brand.fg was tuned for the lighter brand.50/100 surfaces
    // brand.subtle/selected use elsewhere, not this one-step-darker
    // activeBg. brand.700 clears 4.5:1 against brand.200 (~5:1); dark
    // mode's activeBg/brand.fg pairing already passes, so only light needs
    // the override.
    const activeColor = isDark ? "var(--chakra-colors-brand-fg)" : "var(--chakra-colors-brand-700)";

    return (
        <NavLink
            to={to}
            className="mystic-sidebar-link"
            onClick={onClick}
            onMouseEnter={() => {
                setIsHovered(true);
                prefetchRoute(to);
            }}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => prefetchRoute(to)}
            style={({ isActive }) => ({
                display: "block",
                // Left edge carries a 3px accent bar on the active item (see
                // borderLeft below); padding-left is reduced by that same
                // 3px so the label doesn't shift sideways when a link
                // becomes active - every link reserves the space whether or
                // not its border is currently visible.
                padding: "0.625rem var(--chakra-spacing-3) 0.625rem calc(var(--chakra-spacing-3) - 3px)",
                borderRadius: "var(--chakra-radii-md)",
                borderLeft: isActive ? "3px solid var(--chakra-colors-brand-solid)" : "3px solid transparent",
                // A small nudge above Chakra's "md" font-size token (there's
                // no token between md and lg in the default scale, and lg
                // reads as too large here) - still derived from the design
                // token via CSS var, the same way this file already reads
                // brand-fg/brand-9xx colors, rather than a fully hardcoded
                // px/rem value.
                fontSize: "calc(var(--chakra-font-sizes-md) * 1.0625)",
                fontWeight: isActive ? 600 : 500,
                color: isActive ? activeColor : "var(--chakra-colors-fg-default)",
                background: isActive ? activeBg : isHovered ? hoverBg : "transparent",
                // Fast, snappy feedback rather than Chakra's default ~200ms
                // recipe transition, which reads as sluggish for something
                // as immediate as a hover response. Sourced from the same
                // durations.hover/easings.hover tokens FAST_HOVER_TRANSITION
                // composes elsewhere (already covers border-color, which the
                // active indicator's borderLeft above animates on), rather
                // than a separate hardcoded copy.
                transition: FAST_HOVER_TRANSITION,
            })}
        >
            {({ isActive }) => (
                <HStack gap={2.5}>
                    {Icon && (
                        <Icon
                            size={17}
                            aria-hidden="true"
                            color={isActive ? activeColor : "var(--chakra-colors-fg-muted)"}
                            style={{ flexShrink: 0, transition: FAST_HOVER_TRANSITION }}
                        />
                    )}
                    <Box as="span">{label}</Box>
                </HStack>
            )}
        </NavLink>
    );
};

/**
 * Primary app navigation. Permanently visible on md+ screens; on smaller
 * screens it's an off-canvas panel toggled by Navbar's menu button (slides
 * in via transform so it stays in the DOM, avoiding remounting nav state).
 * Each permission-gated link is wrapped in IfCan so a caller who lacks that
 * permission never sees it; the route itself is still independently
 * enforced by ProtectedRoute.
 */
const Sidebar: React.FC<SidebarProps> = ({ isOpen, onNavigate, extraItems }) => {
    // Chrome (this sidebar, plus Navbar) always renders in chromeLanguage,
    // not the page-wide translation language - see Navbar.tsx's matching comment
    // and store/languageStore.ts's LanguageMode docstring.
    const chromeLanguage = useLanguageStore((s) => s.chromeLanguage);
    const t = translations.getFixedT(chromeLanguage, "layout");
    // Built-in items pass a "namespace:key" translation key (see NavItem's
    // own docstring in navItems.ts); app-supplied extraItems pass a plain
    // display string instead, which exists() reliably tells apart since a
    // literal label is never itself a registered translation key.
    const resolveLabel = (label: string): string => (translations.exists(label, { lng: chromeLanguage }) ? t(label) : label);
    // Array.prototype.sort is stable (guaranteed since ES2019), so two items
    // with the same order (or both missing one) keep their relative
    // position from the merged array rather than getting shuffled.
    // undefined - undefined would be NaN, not 0, which is why both sides
    // fall back to Infinity rather than comparing `order` directly.
    const items = extraItems && extraItems.length > 0
        ? [...NAV_ITEMS, ...extraItems].sort(
              (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)
          )
        : NAV_ITEMS;
    return (
        <>
        {/* NavLink's `style` prop only takes a plain object (no pseudo-class
            support - see SidebarNavLink's own comment on why hover is
            tracked via state instead), so :focus-visible can't be expressed
            through it the way _focusVisible works on a real Chakra
            component. A scoped stylesheet is the only way to give this link
            the same brand-colored focus ring every other focusable control
            in the app gets from its own recipe. React 19 hoists/dedupes
            <style> by href (same mechanism RouteProgressBar's own keyframes
            rely on), so this is a no-op on re-render, not a re-insert. */}
        <style href="mystic-sidebar-link-focus" precedence="low">
            {".mystic-sidebar-link:focus-visible { outline: 2px solid var(--chakra-colors-brand-solid); outline-offset: 2px; }"}
        </style>
        <Box
            as="nav"
            aria-label={t("mainNavigation")}
            position={{ base: "fixed", md: "sticky" }}
            top={0}
            left={0}
            h="100vh"
            w="60"
            flexShrink={0}
            bg="bg.surface"
            borderRight="1px solid"
            borderColor="border.default"
            zIndex="overlay"
            transform={{ base: isOpen ? "translateX(0)" : "translateX(-100%)", md: "none" }}
            transition="transform var(--chakra-durations-base) var(--chakra-easings-hover)"
            display="flex"
            flexDirection="column"
        >
            {/* h="16" fixed (not py-driven) so this border-bottom lines up
                exactly with Navbar.tsx's own border-bottom - both are fixed
                to the same height for that reason, rather than relying on
                matching padding to coincidentally produce the same total
                height as Navbar's differently-sized content (icon button +
                name text) would. */}
            <Box
                h="16"
                px={6}
                display="flex"
                alignItems="center"
                borderBottom="1px solid"
                borderColor="border.default"
                flexShrink={0}
            >
                <Link to="/dashboard" onClick={onNavigate} style={{ textDecoration: "none" }}>
                    <Logo size="sm" />
                </Link>
            </Box>

            <Stack p={3} gap={1} data-testid="nav-links">
                {items.map((item) => {
                    const link = (
                        <SidebarNavLink
                            key={item.to}
                            to={item.to}
                            onClick={onNavigate}
                            label={resolveLabel(item.label)}
                            icon={item.icon}
                        />
                    );

                    if (!item.permission) return link;

                    return (
                        <IfCan key={item.to} action={item.permission}>
                            {link}
                        </IfCan>
                    );
                })}
            </Stack>
        </Box>
        </>
    );
};

export default Sidebar;
