import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";

extend([a11yPlugin]);

export type BrandScaleStep = "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900";
export type BrandScale = Record<BrandScaleStep, string>;

// Target lightness (%) per step, calibrated against the shipped amber scale
// (app/theme.ts's brand.50-900, itself Tailwind's amber scale) so an
// arbitrary input hue lands at roughly the same visual weight/contrast per
// step as that hand-tuned scale, rather than every custom color needing its
// own manual re-tuning.
const LIGHTNESS_LADDER: Record<BrandScaleStep, number> = {
    "50": 96,
    "100": 90,
    "200": 80,
    "300": 70,
    "400": 60,
    "500": 50,
    "600": 44,
    "700": 37,
    "800": 31,
    "900": 25,
};

// Saturation is held close to the input color's own, but tapered slightly
// at the darkest steps (matching the shipped scale's 900 measuring ~78%
// against 600's ~95%) so very dark steps don't read as an oversaturated,
// almost-neon near-black.
const SATURATION_MULTIPLIER: Record<BrandScaleStep, number> = {
    "50": 1,
    "100": 1,
    "200": 1,
    "300": 1,
    "400": 1,
    "500": 0.97,
    "600": 1,
    "700": 0.95,
    "800": 0.88,
    "900": 0.8,
};

/**
 * Generates a Chakra-shaped 50-900 color scale from a single user-picked
 * hex, keeping that color's hue (and roughly its saturation) fixed and
 * interpolating lightness across LIGHTNESS_LADDER. This is the single
 * source of truth every brand-colored surface (buttons, focus rings, the
 * canvas gradient tint, the logo badge, the favicon) is generated from -
 * see appearanceThemeOverrides.ts and brandIcon.ts for where it's consumed.
 */
export function generateBrandScale(hex: string): BrandScale {
    const { h, s } = colord(hex).toHsl();
    const scale = {} as BrandScale;
    (Object.keys(LIGHTNESS_LADDER) as BrandScaleStep[]).forEach((step) => {
        scale[step] = colord({
            h,
            s: Math.min(100, s * SATURATION_MULTIPLIER[step]),
            l: LIGHTNESS_LADDER[step],
        }).toHex();
    });
    return scale;
}

/** WCAG contrast ratio between two colors (1-21). */
export function contrastRatio(a: string, b: string): number {
    return colord(a).contrast(b);
}
