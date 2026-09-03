import React from "react";
import { Flex, HStack, IconButton, Kbd, Text } from "@chakra-ui/react";
import { Menu, Search } from "lucide-react";

import { useAuthStore } from "../../store/authStore";
import { useLanguageStore } from "../../store/languageStore";
import translations from "../../translations/translations";
import LogoutButton from "../../auth/logout/LogoutButton";
import ControlCluster from "../controls/ControlCluster";
import { ICON_BUTTON_PROPS } from "../../ui/styles/buttonStyles";
import { FAST_HOVER_TRANSITION } from "../../theme/system";

/** Initials from `name` (e.g. "Ada Lovelace" -> "AL"), falling back to the
 * first letter of `email` when `name` is empty. */
function initialsFor(name: string | null, email: string | null): string {
    const source = name?.trim() ? name.trim() : email?.split("@")[0] ?? "";
    if (!source) return "";
    return source
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

interface NavbarProps {
    onToggleSidebar: () => void;
    /**
     * App-supplied content rendered in the top bar's action cluster, left of
     * ThemeToggle/LogoutButton. A free-form ReactNode (unlike Sidebar's
     * `extraItems` list) since the built-ins here are each bespoke
     * components. Optional, defaults to none.
     */
    extraContent?: React.ReactNode;
    /**
     * Opens the Cmd+K/Ctrl+K command palette, giving it a visible clickable
     * trigger alongside the keyboard shortcut. Optional: omitting it hides
     * the trigger.
     */
    onOpenCommandPalette?: () => void;
}

/** Top bar shown alongside Sidebar: mobile menu toggle, signed-in user, logout. */
const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, extraContent, onOpenCommandPalette }) => {
    // Chrome (navbar + Sidebar) renders in chromeLanguage, not the page-wide
    // translation language. See store/languageStore.ts's LanguageMode docstring.
    const chromeLanguage = useLanguageStore((s) => s.chromeLanguage);
    const t = translations.getFixedT(chromeLanguage, "layout");
    const name = useAuthStore((s) => s.name);
    const email = useAuthStore((s) => s.email);
    const initials = initialsFor(name, email);

    return (
        <Flex
            as="header"
            align="center"
            justify="space-between"
            // Below md, the action cluster doesn't fit next to the menu
            // toggle/greeting in one row, so wrap to a second line instead of
            // forcing horizontal scroll. md+ stays a single fixed-height row,
            // lined up with Sidebar's border-bottom.
            wrap={{ base: "wrap", md: "nowrap" }}
            rowGap={2}
            px={{ base: 4, md: 6 }}
            py={{ base: 2, md: 0 }}
            h={{ base: "auto", md: "16" }}
            minH="16"
            flexShrink={0}
            bg="bg.surface"
            borderBottom="1px solid"
            borderColor="border.default"
            position="sticky"
            top={0}
            zIndex="sticky"
        >
            <Flex align="center" gap={3} minW={0}>
                <IconButton
                    aria-label={t("toggleNavigationMenu")}
                    onClick={onToggleSidebar}
                    display={{ base: "inline-flex", md: "none" }}
                    size="sm"
                    {...ICON_BUTTON_PROPS}
                >
                    <Menu size={16} aria-hidden="true" />
                </IconButton>
                {name && (
                    <Flex align="center" gap={2.5} minW={0}>
                        <Flex
                            boxSize="8"
                            flexShrink={0}
                            borderRadius="full"
                            borderWidth="1px"
                            borderColor="border.default"
                            bg="brand.solid"
                            color="brand.contrast"
                            align="center"
                            justify="center"
                            fontSize="sm"
                            fontWeight="semibold"
                            aria-hidden="true"
                        >
                            {initials}
                        </Flex>
                        {/* Flex row (not inline text) so the name is the one item
                            that shrinks/truncates against however much space the
                            flex ancestors give it. "Signed in as" never shrinks or
                            wraps, since a wrapped line would overflow the
                            fixed-height (md+) navbar. */}
                        <HStack gap={1} minW={0}>
                            <Text fontSize="md" color="fg.muted" flexShrink={0} whiteSpace="nowrap">
                                {t("signedInAs")}
                            </Text>
                            <Text fontSize="md" fontWeight="semibold" color="fg.default" flex="1 1 auto" minW={0} maxW="100%" truncate title={name}>
                                {name}
                            </Text>
                        </HStack>
                    </Flex>
                )}
            </Flex>

            {/* flexShrink={1} (CSS default, Chakra doesn't set it) plus
                minW={0} (overrides flex's default min-width:auto) let this
                box actually shrink below its 556px natural width, so
                wrap="wrap" below has room to wrap its children onto a second
                line instead of forcing horizontal overflow. No visible effect
                on desktop, where it all fits on one line anyway. */}
            <Flex align="center" gap={3} wrap="wrap" justify="flex-end" rowGap={2} flexShrink={1} minW={0}>
                {extraContent}
                {onOpenCommandPalette && (
                    // A button styled like a search field, not a real Input:
                    // typing here does nothing, it just opens the dialog.
                    // Hidden below md; the keyboard shortcut still works there.
                    <HStack
                        as="button"
                        onClick={onOpenCommandPalette}
                        aria-label={t("commandPalette.triggerLabel")}
                        display={{ base: "none", md: "flex" }}
                        w="56"
                        h="9"
                        px={3}
                        gap={2}
                        rounded="density.control"
                        borderWidth="1px"
                        borderColor="gray.500"
                        bg="bg.canvas"
                        color="fg.muted"
                        cursor="pointer"
                        // Same border weight as the icon-button cluster
                        // (ICON_BUTTON_PROPS) for a coherent group, but
                        // bg.canvas instead of their solid fill so this still
                        // reads as an input field.
                        _hover={{ borderColor: "gray.700" }}
                        _dark={{ borderColor: "gray.500", _hover: { borderColor: "gray.300" } }}
                        transition={FAST_HOVER_TRANSITION}
                    >
                        <Search size={15} aria-hidden="true" />
                        <Text flex="1" textAlign="left" fontSize="sm">
                            {t("commandPalette.trigger")}
                        </Text>
                        <Kbd flexShrink={0} size="sm">⌘K</Kbd>
                    </HStack>
                )}
                <ControlCluster />
                <LogoutButton />
            </Flex>
        </Flex>
    );
};

export default Navbar;
