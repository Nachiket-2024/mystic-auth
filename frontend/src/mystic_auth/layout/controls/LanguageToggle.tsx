import React, { useMemo } from "react";
import { Flex, Portal, Select, createListCollection, visuallyHiddenStyle } from "@chakra-ui/react";

import {
    LANGUAGE_MODES,
    LANGUAGE_MODE_LABELS,
    useLanguageStore,
    type LanguageMode,
} from "../../store/languageStore";
import translations from "../../translations/translations";
import { BRAND_ICON_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

/**
 * Language switch, backed by store/languageStore.ts. A plain click-to-open
 * dropdown (Chakra's Select, not a typeable Combobox): with only five
 * options a search box isn't worth it.
 *
 * Uses chromeLanguage, not the global page language, since this is Navbar
 * chrome (same reasoning as Navbar.tsx/Sidebar.tsx).
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
            {/* See StyledSelect.tsx: without this, the trigger's auto-wired
                aria-labelledby wins over Select.HiddenSelect's aria-label. */}
            <Select.Label css={visuallyHiddenStyle}>{t("language")}</Select.Label>
            <Select.Control>
                {/* Shares BRAND_ICON_BUTTON_PROPS with ThemeToggle's IconButton
                    so the two styles can't drift apart. */}
                <Select.Trigger
                    fontSize="md"
                    {...BRAND_ICON_BUTTON_PROPS}
                    display="grid"
                >
                    {/* Invisible stack of the same Select.Item parts Select.Content
                        renders, so the trigger grows to fit the longest label. See
                        FontSizeControl.tsx for the same technique. */}
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
                                // Nested _highlighted: brand.fg and brand.solid are both
                                // brand.600 in light mode, so without this, hovering the
                                // selected item rendered orange text on an orange fill.
                                _selected={{
                                    bg: "brand.200",
                                    color: "brand.fg",
                                    fontWeight: "semibold",
                                    _dark: { bg: "brand.selected" },
                                    _highlighted: { bg: "brand.solid", color: "white" },
                                }}
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
