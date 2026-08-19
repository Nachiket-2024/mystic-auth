import React, { useMemo } from "react";
import { Flex, Portal, Select, createListCollection, visuallyHiddenStyle } from "@chakra-ui/react";

import {
    LANGUAGE_MODES,
    LANGUAGE_MODE_LABELS,
    useLanguageStore,
    type LanguageMode,
} from "../../store/languageStore";
import translations from "../../translations/translations";
import { ICON_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

/**
 * Language switch, backed by store/languageStore.ts (persists to
 * localStorage, drives the translations module). A plain click-to-open
 * dropdown (Chakra's Select, not a typeable Combobox) - with only five
 * options (see LANGUAGE_MODES: three plain languages plus two mixed
 * "English chrome + translated page" modes), a search box isn't earning its
 * keep the way it would past a few dozen languages; this matches how most
 * real-world language switchers (GitHub, Wikipedia, Google) work at this
 * scale. Click to open, click an option, closes - the current selection
 * stays visible at rest either way.
 *
 * Uses chromeLanguage (always English unless a plain hi/mr mode is active),
 * not the global page language, for its own label/aria-label - it lives in
 * Navbar, which is chrome, same reasoning as Navbar.tsx/Sidebar.tsx.
 */
const LanguageToggle: React.FC = () => {
    const mode = useLanguageStore((s) => s.mode);
    const setMode = useLanguageStore((s) => s.setMode);
    const chromeLanguage = useLanguageStore((s) => s.chromeLanguage);
    const t = translations.getFixedT(chromeLanguage, "layout");

    const options = useMemo(
        () => LANGUAGE_MODES.map((m) => ({ value: m, label: LANGUAGE_MODE_LABELS[m] })),
        []
    );
    const collection = useMemo(() => createListCollection({ items: options }), [options]);

    return (
        <Select.Root
            collection={collection}
            value={[mode]}
            onValueChange={(details) => {
                const next = details.value[0] as LanguageMode | undefined;
                if (next) setMode(next);
            }}
            size="sm"
            width="fit-content"
        >
            <Select.HiddenSelect aria-label={t("language")} />
            {/* See StyledSelect.tsx's matching comment: without this,
                Select.Trigger's auto-wired aria-labelledby (pointing at
                Select.Label's id) wins over Select.HiddenSelect's aria-label
                above, leaving the trigger unlabeled for assistive tech.
                Visually hidden since this lives in the navbar next to
                ThemeToggle, with no separate on-screen label. */}
            <Select.Label css={visuallyHiddenStyle}>{t("language")}</Select.Label>
            <Select.Control>
                {/* Same border/bg/hover treatment as ThemeToggle's IconButton -
                    shares ICON_BUTTON_PROPS directly so the two can't drift
                    apart the way the old hand-duplicated values could. */}
                <Select.Trigger
                    fontSize="md"
                    {...ICON_BUTTON_PROPS}
                    display="grid"
                >
                    {/* Same technique as FontSizeControl.tsx's matching
                        comment: an invisible stack built from the *same*
                        Select.Item/Select.ItemIndicator parts Select.Content
                        below renders, wrapped in the same p="1"/borderWidth
                        Content itself has, so this reproduces the panel's
                        real padding/icon chrome exactly instead of just
                        approximating it - a mismatch there previously left
                        the open panel's item row a few px too narrow and
                        forced a horizontal scrollbar inside it. Sharing the
                        grid cell (both "1 / 1") with the visible row below
                        means the trigger's width grows to fit the longest
                        language label - not just whichever one is currently
                        selected - and the panel (via Select.Root's default
                        sameWidth positioning) matches it exactly. */}
                    <Flex
                        gridArea="1 / 1"
                        direction="column"
                        h="0"
                        overflow="hidden"
                        p="1"
                        borderWidth="1px"
                        fontSize="md"
                        visibility="hidden"
                        aria-hidden
                    >
                        {options.map((option) => (
                            <Select.Item key={option.value} item={option}>
                                <Select.ItemText>{option.label}</Select.ItemText>
                                <Select.ItemIndicator />
                            </Select.Item>
                        ))}
                    </Flex>
                    <Flex gridArea="1 / 1" justifyContent="space-between" alignItems="center">
                        {/* Recipe default caps this at maxW 80% assuming a
                            fixed-width trigger; now that the trigger sizes to
                            fit-content, that percentage resolves against
                            nothing and truncates the label (e.g. "English" ->
                            "En..."), so it's dropped here. */}
                        <Select.ValueText maxW="none" />
                        <Select.IndicatorGroup>
                            <Select.Indicator />
                        </Select.IndicatorGroup>
                    </Flex>
                </Select.Trigger>
            </Select.Control>
            <Portal>
                <Select.Positioner>
                    <Select.Content
                        borderWidth="1px"
                        borderColor="border.default"
                        bg="bg.surface"
                        boxShadow="lg"
                        fontSize="md"
                    >
                        {options.map((option) => (
                            <Select.Item
                                key={option.value}
                                item={option}
                                _highlighted={{ bg: "brand.solid", color: "white" }}
                                _selected={{ bg: "brand.selected", color: "brand.fg", fontWeight: "semibold" }}
                            >
                                <Select.ItemText>{option.label}</Select.ItemText>
                                <Select.ItemIndicator />
                            </Select.Item>
                        ))}
                    </Select.Content>
                </Select.Positioner>
            </Portal>
        </Select.Root>
    );
};

export default LanguageToggle;
