import React, { useMemo } from "react";
import { Flex, Portal, Select, createListCollection, visuallyHiddenStyle } from "@chakra-ui/react";

import { FONT_SIZES, useFontSizeStore, type FontSize } from "../../store/fontSizeStore";
import translations from "../../translations/translations";
import { useLanguageStore } from "../../store/languageStore";
import { BRAND_ICON_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

/**
 * Global text-size control, backed by store/fontSizeStore.ts (persists to
 * localStorage, scales the root <html> font-size, see that store's own
 * docstring). A Select dropdown, same pattern as LanguageToggle, rather than
 * the previous A-/A+ stepper buttons - the trigger stays a fixed "Size"
 * label (not the current size) so it reads as a settings control, matching
 * the dropdown mockup the user picked over a live-value trigger.
 *
 * Uses chromeLanguage, not the page-wide translation language, for its
 * label/aria-label - same reasoning as ThemeToggle/LanguageToggle, since this
 * lives in Navbar, which is chrome.
 */
const FontSizeControl: React.FC = () => {
    const chromeLanguage = useLanguageStore((s) => s.chromeLanguage);
    const t = translations.getFixedT(chromeLanguage, "layout");
    const fontSize = useFontSizeStore((s) => s.fontSize);
    const setFontSize = useFontSizeStore((s) => s.setFontSize);

    const options = useMemo(
        () => FONT_SIZES.map((size) => ({ value: size, label: t(`fontSize.${size}`) })),
        [t]
    );
    const collection = useMemo(() => createListCollection({ items: options }), [options]);

    return (
        <Select.Root
            collection={collection}
            value={[fontSize]}
            onValueChange={(details) => {
                const next = details.value[0] as FontSize | undefined;
                if (next) setFontSize(next);
            }}
            size="sm"
            width="fit-content"
        >
            <Select.HiddenSelect aria-label={t("fontSize.label")} />
            {/* See LanguageToggle.tsx's matching comment: without this,
                Select.Trigger's auto-wired aria-labelledby wins over
                Select.HiddenSelect's aria-label above. Visually hidden since
                this lives in the navbar with no separate on-screen label. */}
            <Select.Label css={visuallyHiddenStyle}>{t("fontSize.label")}</Select.Label>
            <Select.Control>
                {/* Same border/bg/hover treatment as ThemeToggle/LanguageToggle -
                    shares BRAND_ICON_BUTTON_PROPS directly so the three can't
                    drift apart the way hand-duplicated values could. */}
                <Select.Trigger
                    fontSize="md"
                    {...BRAND_ICON_BUTTON_PROPS}
                    display="grid"
                >
                    {/* Trigger always shows the fixed "Size" label, not the
                        current value (see docstring), so its own text can't
                        drive a width wide enough for the panel's options.
                        This invisible stack - built from the *same*
                        Select.Item/Select.ItemIndicator parts Select.Content
                        below renders, wrapped in the same p="1"/borderWidth
                        Content itself has - reproduces the panel's real
                        padding/icon chrome exactly, so the grid cell it
                        shares with the visible row (both "1 / 1") sizes to
                        the true widest requirement. A hand-approximated copy
                        (plain text + trigger's chevron slot) undersized this
                        against the content's own item/content padding,
                        leaving the open panel's item row a few px too narrow
                        and forcing a horizontal scrollbar inside it. */}
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
                        {t("fontSize.trigger")}
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
                                // bg: brand.200 by default (light), one step darker than
                                // brand.selected's own brand.100 there - that read as barely
                                // more emphasized than the plain unselected rows' own
                                // gray.700 text, so the "selected" state didn't stand out at
                                // a glance the way the solid-fill hover does. Overridden to
                                // brand.selected's brand.800 in dark (already fine). `_light`
                                // is NOT a real Chakra condition (only `_dark` is) - an
                                // earlier version nested `bg: { _light, _dark }` here, which
                                // silently dropped the light value, leaving no visible fill
                                // at rest. Nested _highlighted below: see LanguageToggle.tsx's
                                // matching comment - without it, hovering the selected row
                                // renders invisible same-color text (brand.fg and
                                // brand.solid are both brand.600 light).
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

export default FontSizeControl;
