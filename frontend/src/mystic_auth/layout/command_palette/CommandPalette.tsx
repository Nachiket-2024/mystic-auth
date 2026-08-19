import React, { useRef, useState } from "react";
import { Box, Dialog, HStack, Input, Kbd, Portal, Stack } from "@chakra-ui/react";
import { useNavigate } from "react-router";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../../ui/styles/dialogStyles";
import { type NavItem } from "../app_layout/navItems";
import { type SearchItem } from "./searchItems";
import { useDebouncedValue } from "../../ui/hooks/useDebouncedValue";
import { useCommandPaletteResults } from "./CommandPaletteResults";
import CommandPaletteResultsList from "./CommandPaletteResultsList";

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    /** Appended after the built-in NAV_ITEMS, same prop AppLayout takes -
     * pass the same reference given to AppLayout so the palette's "Pages"
     * group matches the sidebar. See
     * docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points. */
    extraNavItems?: NavItem[];
    /** Appended after the built-in SEARCH_ITEMS - your own page's
     * searchable content (a settings card, a specific tab/section), same
     * "typed, optional, additive" shape as `extraNavItems`. See
     * docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points. */
    extraSearchItems?: SearchItem[];
}

/**
 * Cmd+K / Ctrl+K quick-jump palette: search/select any nav destination the
 * caller currently has permission to see, same IfCan-equivalent gating
 * Sidebar uses (via useAuthorization().can), so this never advertises a
 * route the caller can't actually open. Once the query is non-empty it also
 * searches:
 *  - real content within pages (SEARCH_ITEMS/searchItems.ts - a specific
 *    settings tab, a specific audit-log category/scope) matched against
 *    each item's resolved label/detail/group/matchKeys text, so e.g. typing
 *    "password" surfaces "Change Password" even though the current page's
 *    own content isn't otherwise indexed anywhere. Selecting one navigates
 *    to a `?query=param` a page reads once on mount to select the right
 *    tab (AccountSettingsPage/AuditLogPage), or a `#hash` AppLayout's
 *    useScrollToHash scrolls to.
 *  - every individual matching string across all pages, Ctrl+F-style (not
 *    just titles/labels): each distinct leaf translation string under a
 *    page's PAGE_CONTENT_NAMESPACES or a SEARCH_ITEMS' `scope` that
 *    contains the query becomes its own "Matching text" row showing that
 *    exact text, capped at TEXT_MATCH_RESULTS_LIMIT and deduped per
 *    destination. Selecting one navigates the same way the page/feature
 *    row for that destination would.
 *  - real user accounts server-side (same endpoint/`search` param
 *    UsersPage.tsx uses), gated on users:list_all, so a caller who can't
 *    open the Users page never sees account data leak through the palette.
 *    Selecting a user jumps to /users?search=<email>, which UsersPage reads
 *    on mount to land pre-filtered on that account.
 * Controlled by App.tsx, which owns the global keydown listener that
 * toggles `isOpen`. Result-building logic lives in CommandPaletteResults.ts,
 * the result list's rendering in CommandPaletteResultsList.tsx - this file
 * owns the dialog shell, search input, and keyboard navigation.
 */
const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, extraNavItems, extraSearchItems }) => {
    const { t } = useTranslation("layout");
    const navigate = useNavigate();

    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const debouncedQuery = useDebouncedValue(query);
    const trimmedQuery = debouncedQuery.trim();

    const { filtered, kindCount } = useCommandPaletteResults(trimmedQuery, extraNavItems, extraSearchItems);

    // Reset search + selection every time the palette opens, so it never
    // reopens showing the previous session's leftover query/highlight.
    // Adjusted during render (React's documented pattern for state derived
    // from props, same "adjust during render" pattern PolicyFormDialog.tsx/
    // UserPoliciesDialog.tsx already use for their own open-triggered
    // resets) rather than in an effect, since setState-in-effect causes an
    // extra, avoidable render.
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setQuery("");
            setActiveIndex(0);
        }
    }

    // Same reasoning: highlight always snaps back to the top result as the
    // query changes, computed during render rather than via a `[query]`
    // effect.
    const [prevQuery, setPrevQuery] = useState(query);
    if (query !== prevQuery) {
        setPrevQuery(query);
        setActiveIndex(0);
    }

    const goTo = (to: string) => {
        navigate(to);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const target = filtered[activeIndex];
            if (target) goTo(target.to);
        }
    };

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={(details) => !details.open && onClose()}
            initialFocusEl={() => inputRef.current}
        >
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                    <Dialog.Content {...DIALOG_CONTENT_PROPS} maxW="md" my={{ base: "3", md: "20" }}>
                        <Dialog.Body p={0}>
                            <HStack px={4} py={3} borderBottom="1px solid" borderColor="border.default" gap={2}>
                                <Box color="fg.muted" flexShrink={0}>
                                    <Search size={18} aria-hidden="true" />
                                </Box>
                                <Input
                                    ref={inputRef}
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={t("commandPalette.placeholder")}
                                    variant="flushed"
                                    border="none"
                                    // border="none" above suppresses the flushed variant's own
                                    // focus border entirely, leaving this input with no visible
                                    // focus indicator at all (WCAG 2.4.7) - it's also the palette's
                                    // initialFocusEl, so it's always the first thing focused on
                                    // open. An inset bottom-border keeps the borderless look on
                                    // every other edge while still giving keyboard users a clear
                                    // focus cue.
                                    _focus={{ boxShadow: "inset 0 -2px 0 0 var(--chakra-colors-brand-solid)" }}
                                    autoComplete="off"
                                    aria-label={t("commandPalette.placeholder")}
                                />
                                <Kbd flexShrink={0} display={{ base: "none", sm: "inline-flex" }}>Esc</Kbd>
                            </HStack>

                            <Stack gap={0} py={2} maxH="80" overflowY="auto">
                                <CommandPaletteResultsList
                                    filtered={filtered}
                                    kindCount={kindCount}
                                    activeIndex={activeIndex}
                                    setActiveIndex={setActiveIndex}
                                    goTo={goTo}
                                />
                            </Stack>
                        </Dialog.Body>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    );
};

export default CommandPalette;
