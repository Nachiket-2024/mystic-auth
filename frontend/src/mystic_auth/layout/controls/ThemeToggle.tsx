import React from "react";
import { Box, IconButton } from "@chakra-ui/react";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useThemeStore } from "../../store/themeStore";
import { BRAND_ICON_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

// Rotate+cross-fade timing for the Sun/Moon swap below, composed from the
// same durations.hover/easings.hover tokens FAST_HOVER_TRANSITION uses
// elsewhere (see theme/system.ts) rather than a separate hardcoded duration.
const ICON_SWAP_TRANSITION = "opacity var(--chakra-durations-hover) var(--chakra-easings-hover), transform var(--chakra-durations-hover) var(--chakra-easings-hover)";

/**
 * Light/dark mode switch, backed by store/themeStore.ts (persists to
 * localStorage, toggles the `.dark` class Chakra's own _dark/_light style
 * conditions key off, see that store's own docstring for why there's no
 * separate ColorModeProvider in Chakra v3 to reach for instead).
 */
const ThemeToggle: React.FC = () => {
    const { t } = useTranslation("layout");
    const colorMode = useThemeStore((s) => s.colorMode);
    const toggleColorMode = useThemeStore((s) => s.toggleColorMode);
    const isDark = colorMode === "dark";

    return (
        <IconButton
            aria-label={isDark ? t("switchToLightMode") : t("switchToDarkMode")}
            onClick={toggleColorMode}
            size="sm"
            {...BRAND_ICON_BUTTON_PROPS}
        >
            {/* Both icons always render, stacked in the same spot - only
                opacity/rotation swap on colorMode change, so the toggle
                animates between them instead of instantly swapping. Neither
                is ever permanently tinted (no fixed yellow sun / blue moon):
                color still just inherits ICON_BUTTON_PROPS' own currentColor/
                hover treatment, same as every other top-bar icon button. */}
            <Box position="relative" boxSize="4" display="flex" alignItems="center" justifyContent="center">
                <Sun
                    size={16}
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        transition: ICON_SWAP_TRANSITION,
                        opacity: isDark ? 1 : 0,
                        transform: isDark ? "rotate(0deg) scale(1)" : "rotate(-90deg) scale(0.5)",
                    }}
                />
                <Moon
                    size={16}
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        transition: ICON_SWAP_TRANSITION,
                        opacity: isDark ? 0 : 1,
                        transform: isDark ? "rotate(90deg) scale(0.5)" : "rotate(0deg) scale(1)",
                    }}
                />
            </Box>
        </IconButton>
    );
};

export default ThemeToggle;
