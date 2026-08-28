import React, { useMemo } from "react";
import { Flex, Portal, Select, createListCollection, visuallyHiddenStyle } from "@chakra-ui/react";

import { FONT_SIZES, useFontSizeStore, type FontSize } from "../../store/fontSizeStore";
import translations from "../../translations/translations";
import { useLanguageStore } from "../../store/languageStore";
import { BRAND_ICON_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

/**
 * Global text-size control, backed by store/fontSizeStore.ts. A Select
 * dropdown, same pattern as LanguageToggle. The trigger stays a fixed
 * "Size" label, not the current value, so it reads as a settings control.
 *
 * Uses chromeLanguage, not the page-wide translation language, since this
 * lives in Navbar chrome (same reasoning as ThemeToggle/LanguageToggle).
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
            {/* See LanguageToggle.tsx: without this, the trigger's
                auto-wired aria-labelledby wins over Select.HiddenSelect's
                aria-label. Visually hidden, no on-screen label in the navbar. */}
            <Select.Label css={visuallyHiddenStyle}>{t("fontSize.label")}</Select.Label>
            <Select.Control>
                {/* Shares BRAND_ICON_BUTTON_PROPS with ThemeToggle/LanguageToggle
                    so the three styles can't drift apart. */}
                <Select.Trigger
                    fontSize="md"
                    {...BRAND_ICON_BUTTON_PROPS}
                    display="grid"
                >
                    {/* The trigger always shows the fixed "Size" label, so its
                        own text can't size the panel's width. This invisible
                        stack, built from the same Select.Item parts
                        Select.Content renders, reproduces the panel's real
                        padding/chrome so the grid cell sizes to the true
                        widest option; a hand-approximated copy previously
                        undersized it and forced a horizontal scrollbar. */}
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
                                // bg: brand.200 in light, one step darker than
                                // brand.selected's brand.100 there, since that read as
                                // barely emphasized against unselected rows' text.
                                // `_light` isn't a real Chakra condition, so this is the
                                // unconditioned base value; nested _highlighted avoids
                                // invisible same-color text on hover (see LanguageToggle.tsx).
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
