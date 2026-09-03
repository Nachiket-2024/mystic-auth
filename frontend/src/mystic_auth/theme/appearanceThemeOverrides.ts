import { colord, extend } from "colord";
import mixPlugin from "colord/plugins/mix";
import type { SystemConfig } from "@chakra-ui/react";

import { generateBrandScale } from "./generateBrandScale";

extend([mixPlugin]);

// Chakra's stock gray.900 (themeSemanticTokens.ts's bg.canvas dark default).
// Dark mode's canvasFrom is blended against this rather than a flat brand step.
const GRAY_900 = "#18181b";

export interface AppearancePreferences {
    brandColor: string | null;
}

/** The bg.canvasFrom pair for an arbitrary brand scale - shared with
 * AppearanceCard.tsx's preview boxes so they show exactly what applying
 * the pick will render. */
export function deriveCanvasFrom(scale: ReturnType<typeof generateBrandScale>): { light: string; dark: string } {
    return {
        light: scale["100"],
        dark: colord(GRAY_900).mix(scale["900"], 0.35).toHex(),
    };
}

/**
 * Builds the SystemConfig fragment reflecting a user's brand color choice,
 * for AppearanceThemeProvider.tsx to merge on top of the base system
 * (theme/system.ts's buildSystem). Returns null when nothing is customized,
 * so the provider can skip rebuilding for the common case.
 *
 * There's no separate background-color pick: the page background
 * (bg.canvasFrom, the soft top-of-viewport gradient tint) is derived
 * straight from the picked brand color's generated scale: brand.100 in
 * light mode, a 65/35 blend of gray.900 with brand.900 in dark mode (a flat
 * brand.900 wash read as too strong; plain gray read as unbranded).
 * bg.canvas/bg.canvasTo/bg.surface stay at their stock values in both modes.
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
