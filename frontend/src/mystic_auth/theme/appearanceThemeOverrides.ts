import { colord, extend } from "colord";
import mixPlugin from "colord/plugins/mix";
import type { SystemConfig } from "@chakra-ui/react";

import { generateBrandScale } from "./generateBrandScale";

extend([mixPlugin]);

// Chakra's stock gray.900 (themeSemanticTokens.ts's bg.canvas dark
// default). Dark mode's canvasFrom is blended against this rather than
// used as a flat brand scale step - see below.
const GRAY_900 = "#18181b";

export interface AppearancePreferences {
    brandColor: string | null;
}

/** The bg.canvasFrom pair (see buildAppearanceThemeOverrides' docstring)
 * for an arbitrary brand scale - shared with AppearanceCard.tsx's own
 * light/dark preview boxes so they show exactly what applying the pick
 * will actually render, not an approximation of it. */
export function deriveCanvasFrom(scale: ReturnType<typeof generateBrandScale>): { light: string; dark: string } {
    return {
        light: scale["100"],
        dark: colord(GRAY_900).mix(scale["900"], 0.35).toHex(),
    };
}

/**
 * Builds the SystemConfig fragment that reflects a user's own brand color
 * choice, for AppearanceThemeProvider.tsx to merge on top of the base
 * system (theme/system.ts's buildSystem) via createSystem - see that
 * function's own docstring for why this has to happen at the system-build
 * level rather than as a post-hoc CSS override. Returns null when nothing
 * is customized, so the provider can skip rebuilding the system entirely
 * for the overwhelmingly common (un-customized) case.
 *
 * There's no separate background-color pick any more: the page background
 * (bg.canvasFrom - the soft top-of-viewport tint every AppLayout/AuthLayout/
 * LandingPage gradient reads from, see themeSemanticTokens.ts) is derived
 * straight from the picked brand color's own generated scale, the same
 * treatment app/theme.ts's own stock override gives the shipped amber
 * brand: brand.100 in light mode, and a 65/35 blend of gray.900 with
 * brand.900 in dark mode (a flat brand.900 wash read as too strong at the
 * top of a dark viewport; plain gray alone read as unbranded). bg.canvas/
 * bg.canvasTo/bg.surface are left at their stock values in both modes, same
 * as the shipped theme - only the gradient's start color moves with the
 * user's brand pick.
 */
export function buildAppearanceThemeOverrides(prefs: AppearancePreferences): SystemConfig | null {
    const { brandColor } = prefs;
    if (!brandColor) return null;

    const scale = generateBrandScale(brandColor);

    return {
        theme: {
            tokens: {
                colors: {
                    brand: (Object.keys(scale) as (keyof typeof scale)[]).reduce(
                        (acc, step) => ({ ...acc, [step]: { value: scale[step] } }),
                        {} as Record<string, { value: string }>
                    ),
                },
            },
            semanticTokens: {
                colors: {
                    "bg.canvasFrom": {
                        value: {
                            _light: deriveCanvasFrom(scale).light,
                            _dark: deriveCanvasFrom(scale).dark,
                        },
                    },
                },
            },
        },
    };
}
