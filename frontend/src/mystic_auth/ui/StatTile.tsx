import React from "react";
import { Box, Skeleton, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { useLanguageStore } from "../store/languageStore";
import { formatNumber } from "../translations/numerals";

export interface StatTileProps {
    label: string;
    value: number | undefined;
    isLoading: boolean;
    color?: string;
    /** Applies a filter (or other action) tied to this tile when given - the
     * tile becomes a clickable shortcut instead of a read-only number. Omit
     * for a tile with no corresponding action. */
    onClick?: () => void;
    /** Overrides the default `Filter: {label}` aria-label used when onClick
     * is given, for callers that want more specific wording. */
    ariaLabel?: string;
}

// NOT the same solid-fill hover TableActionButton/Pagination use: those only
// hold one text color, but a stat tile holds several at once (a colored
// number plus a muted label), and a solid fill washed both out (this was the
// actual bug report). `brand.subtle`/`brand.selected` (Sidebar's existing
// "highlighted without inverting" language) is a light tinted wash that sits
// behind existing text colors instead of replacing them.
const STAT_TILE_HOVER_PROPS = {
    borderWidth: "1px",
    borderColor: "transparent",
    transition: "background var(--chakra-durations-fast) var(--chakra-easings-hover), border-color var(--chakra-durations-fast) var(--chakra-easings-hover)",
    _hover: { bg: "brand.selected", borderColor: "brand.solid" },
    // Plain Box as="button" gets no recipe styling at all (unlike a real
    // Chakra Button), so without this a keyboard user tabbing here saw only
    // the bare browser-default outline - present, but visually
    // inconsistent with every other focusable control in the app (Button/
    // Input/StyledSelect all render a brand-colored ring via their own
    // recipe's _focusVisible). Chakra's _focusVisible style prop still
    // works here since it's a core style prop, not recipe-specific.
    _focusVisible: { outline: "2px solid", outlineColor: "brand.solid", outlineOffset: "2px" },
};

/**
 * StatTile
 * ----------------------------
 * A single labeled number in a summary card (UserStatsCard, PolicyStatsCard):
 * a large colored value with a muted label beneath it, optionally clickable.
 */
const StatTile: React.FC<StatTileProps> = ({ label, value, isLoading, color = "fg.default", onClick, ariaLabel }) => {
    const { t } = useTranslation("ui_text");
    // chromeLanguage, not pageLanguage: numerals stay in English/ASCII digits
    // even in a mixed "en+hi" mode, the same way dates already do (see
    // dateFormat.ts's callers) - only translated text switches with pageLanguage.
    const language = useLanguageStore((s) => s.chromeLanguage);
    return (
    <Box
        textAlign="center"
        rounded="md"
        py={1}
        {...(onClick && {
            as: "button",
            type: "button",
            onClick,
            cursor: "pointer",
            "aria-label": ariaLabel ?? t("filterLabel", { label }),
            ...STAT_TILE_HOVER_PROPS,
        })}
    >
        {isLoading ? (
            // bg.muted, not Skeleton's default bg.emphasized: this tile sits
            // inside a Card (bg.surface), and in dark mode bg.emphasized
            // resolves to the exact same gray.800 as bg.surface (see
            // theme/system.ts) - an invisible skeleton, even mid-pulse,
            // since the color never actually differs from the card behind it.
            <Skeleton height="8" mx="auto" w="12" bg="bg.muted" />
        ) : (
            <Text fontSize="3xl" fontWeight="bold" color={color} lineHeight="1">
                {formatNumber(value, language)}
            </Text>
        )}
        <Text fontSize="md" color="fg.muted" mt={1} whiteSpace="nowrap">
            {label}
        </Text>
    </Box>
    );
};

export default StatTile;
