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

/** First letter of up to the first two words in `name` (e.g. "Ada Lovelace"
 * -> "AL", "cheryl" -> "C") - falls back to the first letter of `email`
 * (before the @) when `name` is empty, so a profile with no display name
 * yet still gets a one-letter avatar instead of a blank circle. */
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
     * App-supplied content (buttons, icons, links, ...) rendered in the top
     * bar's action cluster, to the left of ThemeToggle/LogoutButton. Unlike
     * Sidebar's `extraItems` (a declarative link list, since sidebar entries
     * are all "the same shape"), the top bar's own built-ins are each
     * bespoke components, so this is a free-form ReactNode slot rather than
     * a typed item array: pass whatever you'd render anywhere else. See
     * AppLayout's own docstring and
     * docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points.
     * Optional and defaults to none, so existing callers see no change.
     */
    extraContent?: React.ReactNode;
    /**
     * Opens the same Cmd+K/Ctrl+K command palette App.tsx's global keydown
     * listener toggles - wired here so the palette has a visible, clickable
     * affordance (a search-bar-styled button) instead of being discoverable
     * only via the keyboard shortcut. Optional: omitting it simply hides the
     * trigger, same as before this prop existed.
     */
    onOpenCommandPalette?: () => void;
}

/**
 * Top bar shown alongside Sidebar. Hosts the mobile menu toggle (hidden on
 * md+, where Sidebar is always visible), the caller's own name, and the
 * existing LogoutButton container (unchanged, already owns its own
 * mutation/navigation logic).
 */
const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, extraContent, onOpenCommandPalette }) => {
    // Chrome (this navbar, plus Sidebar) always renders in chromeLanguage,
    // not the page-wide translation language: it's English by default and stays
    // English even in the "en+hi"/"en+mr" mixed modes, only switching along
    // with the rest of the app for the plain "hi"/"mr" modes. See
    // store/languageStore.ts's LanguageMode docstring.
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
            // Below md, the right-hand action cluster doesn't fit next to the
            // left-hand menu toggle/greeting in a single 375px row - a fixed
            // h="16" + nowrap there forced the whole page into horizontal
            // scroll. Wrapping (auto height) lets it fall to a second line
            // instead; md+ keeps the original single row, where h="16" also
            // has to line up with Sidebar's own border-bottom.
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
                        {/* A flex row (not inline text) so the name is the one flex
                            item that shrinks/truncates - a plain inline maxW inside
                            block text doesn't adapt to however much space the flex
                            ancestors actually squeezed this into, and just overflows
                            past its own paragraph instead. "Signed in as" itself
                            never shrinks or wraps (flexShrink=0/whiteSpace=nowrap);
                            at a fixed-height (md+) navbar, a wrapped second line was
                            pushed past the row's own height. */}
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

            <Flex align="center" gap={3} wrap="wrap" justify="flex-end" rowGap={2} flexShrink={0}>
                {extraContent}
                {onOpenCommandPalette && (
                    // A real Input here would need onChange/value wiring for a
                    // field that never actually accepts typed text (typing
                    // opens the dialog's input, not this one), so a plain
                    // button styled to look like a search field avoids that
                    // dead state. Hidden below md; the keyboard shortcut itself
                    // (App.tsx's global keydown listener) still works there.
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
                        // Same border weight as the icon-button cluster it sits
                        // next to (ICON_BUTTON_PROPS in ui/styles/buttonStyles.ts)
                        // so the whole action cluster reads as one coherent
                        // group, while keeping bg.canvas (not their solid gray
                        // fill) so this one still reads as an input field, not
                        // another button.
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
