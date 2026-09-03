import React, { useState } from "react";
import { Box, HStack, Link as ChakraLink, Stack } from "@chakra-ui/react";
import { Link, NavLink } from "react-router";
import { Mail, type LucideIcon } from "lucide-react";

import { IfCan } from "../../authorization/IfCan";
import { NAV_ITEMS, type NavItem } from "./navItems";
import Logo from "./Logo";
import { useThemeStore } from "../../store/themeStore";
import { useLanguageStore } from "../../store/languageStore";
import translations from "../../translations/translations";
import { prefetchRoute } from "./routePrefetch";
import { FAST_HOVER_TRANSITION } from "../../theme/system";
import { SUPPORT_EMAIL } from "../../core/settings";

interface SidebarProps {
    isOpen: boolean;
    onNavigate: () => void;
    /**
     * App-supplied links, merged with the built-in ones and sorted by
     * `order` (items without one sort last, in the order given). Same
     * NavItem shape and IfCan gating as the built-ins. Optional, defaults to
     * none.
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
 * Single nav entry. Tracks hover in state rather than a CSS `:hover` rule,
 * since NavLink's `style` prop only takes a function of `{ isActive }` with
 * no hover equivalent.
 */
const SidebarNavLink: React.FC<SidebarNavLinkProps> = ({ to, onClick, label, icon: Icon }) => {
    const [isHovered, setIsHovered] = useState(false);
    const isDark = useThemeStore((s) => s.colorMode === "dark");

    // Raw brand scale steps, not the shared brand.subtle/selected tokens:
    // those read as barely-there against the sidebar's white bg.surface, so
    // hover/active go one step further. NavLink's style prop can't use
    // Chakra's _dark condition, hence reading colorMode directly. Dark
    // mode's scale runs the opposite direction (lower number = brighter).
    const hoverBg = isDark ? "var(--chakra-colors-brand-900)" : "var(--chakra-colors-brand-100)";
    const activeBg = isDark ? "var(--chakra-colors-brand-800)" : "var(--chakra-colors-brand-200)";
    // brand.fg only clears WCAG AA contrast against the lighter brand.50/100
    // surfaces; against light mode's activeBg (brand.200) it falls under
    // 4.5:1, so light mode uses brand.700 instead. Dark mode's pairing
    // already passes.
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
                // padding-left is reduced by the 3px borderLeft below, so
                // every link reserves that space and the label doesn't shift
                // when a link becomes active.
                padding: "0.625rem var(--chakra-spacing-3) 0.625rem calc(var(--chakra-spacing-3) - 3px)",
                borderRadius: "var(--chakra-radii-md)",
                borderLeft: isActive ? "3px solid var(--chakra-colors-brand-solid)" : "3px solid transparent",
                // Nudge above Chakra's "md" font-size token (no token
                // between md and lg fits here), still derived via CSS var.
                fontSize: "calc(var(--chakra-font-sizes-md) * 1.0625)",
                fontWeight: isActive ? 600 : 500,
                color: isActive ? activeColor : "var(--chakra-colors-fg-default)",
                background: isActive ? activeBg : isHovered ? hoverBg : "transparent",
                // Faster than Chakra's default ~200ms transition, which reads
                // as sluggish for hover feedback.
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
 * Primary app navigation. Always visible on md+ screens; on smaller screens
 * it's an off-canvas panel toggled by Navbar's menu button (slides via
 * transform, staying in the DOM). Permission-gated links are wrapped in
 * IfCan; the route itself is still independently enforced by ProtectedRoute.
 */
const Sidebar: React.FC<SidebarProps> = ({ isOpen, onNavigate, extraItems }) => {
    // Chrome (sidebar + Navbar) renders in chromeLanguage, not the page-wide
    // translation language. See store/languageStore.ts's LanguageMode docstring.
    const chromeLanguage = useLanguageStore((s) => s.chromeLanguage);
    const t = translations.getFixedT(chromeLanguage, "layout");
    // Built-in items pass a "namespace:key" translation key; app-supplied
    // extraItems pass a plain display string. exists() tells them apart.
    const resolveLabel = (label: string): string => (translations.exists(label, { lng: chromeLanguage }) ? t(label) : label);
    // Array.sort is stable, so items with the same (or missing) order keep
    // their relative position. Missing order falls back to Infinity, not
    // undefined, since undefined - undefined is NaN, not 0.
    const items = extraItems && extraItems.length > 0
        ? [...NAV_ITEMS, ...extraItems].sort(
              (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity)
          )
        : NAV_ITEMS;
    return (
        <>
        {/* NavLink's `style` prop can't express :focus-visible, so a scoped
            stylesheet gives this link the same brand-colored focus ring other
            focusable controls get from their recipe. React 19 hoists/dedupes
            <style> by href, so this is a no-op on re-render. */}
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
                exactly with Navbar's own. */}
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

            {/* Pinned to the bottom rather than mixed into the nav list: a
                support contact isn't a page to navigate to. Only renders once
                SUPPORT_EMAIL is configured (unset by default, core/settings.ts)
                so a fresh fork doesn't show a link to nothing. Also duplicated
                as a card on Account Settings' Legal tab. */}
            {SUPPORT_EMAIL && (
                <Box p={3} mt="auto" borderTop="1px solid" borderColor="border.default" flexShrink={0}>
                    <ChakraLink
                        href={`mailto:${SUPPORT_EMAIL}`}
                        display="flex"
                        alignItems="center"
                        gap={2.5}
                        px={3}
                        py={2}
                        rounded="density.control"
                        fontSize="sm"
                        fontWeight="600"
                        color="brand.fg"
                        textDecoration="none"
                        transition={FAST_HOVER_TRANSITION}
                        _hover={{ bg: "brand.subtle", textDecoration: "underline" }}
                    >
                        <Mail size={17} aria-hidden="true" style={{ flexShrink: 0 }} />
                        {t("footer.help")}
                    </ChakraLink>
                </Box>
            )}
        </Box>
        </>
    );
};

export default Sidebar;
