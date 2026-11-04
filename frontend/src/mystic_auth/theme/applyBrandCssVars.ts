import { generateBrandScale } from "./generateBrandScale";
import { deriveCanvasFrom, deriveSidebar } from "./appearanceThemeOverrides";
import { BRAND_COLOR } from "../core/settings";
import { useAppearanceStore } from "../store/appearanceStore";
import { useThemeStore } from "../store/themeStore";
import appThemeOverrides from "../../app/theme";

/**
 * Plain-CSS-variable theme: writes --brand-50..900 plus the light/dark pairs
 * that do not derive from those steps (--bg-canvas-from, --bg-sidebar; see
 * appearanceThemeOverrides.ts) onto <html>, from the signed-in user's
 * Appearance pick (falling back to BRAND_COLOR, then app/theme.ts). Other
 * brand tokens in tailwind-tokens.css reference var(--brand-*), so overriding
 * the raw steps is enough in light and dark.
 *
 * Runs once at import time (before first paint, like themeStore.ts) and again
 * on every appearanceStore or themeStore change, since the canvas/sidebar pair
 * depends on colorMode. No React provider needed; it only sets DOM styles.
 */
function applyBrandCssVars(hex: string) {
    const scale = generateBrandScale(hex);
    const canvas = deriveCanvasFrom(scale);
    const sidebar = deriveSidebar(scale);
    const isDark = useThemeStore.getState().colorMode === "dark";
    const root = document.documentElement.style;

    for (const [step, value] of Object.entries(scale)) {
        root.setProperty(`--brand-${step}`, value);
    }
    root.setProperty("--bg-canvas-from", isDark ? canvas.dark : canvas.light);
    root.setProperty("--bg-sidebar", isDark ? sidebar.dark : sidebar.light);
}

function currentBrandColor(): string {
    return useAppearanceStore.getState().brandColor ?? appThemeOverrides.brandColor ?? BRAND_COLOR;
}

// Fork-level static overrides (any tailwind-tokens.css var beyond the brand scale -
// fonts, radii, etc.), applied once at startup. Lower priority than
// everything above: a signed-in user's own brand pick still wins on
// whichever --brand-* steps it touches, since applyBrandCssVars below runs
// after this and unconditionally sets every step.
for (const [name, value] of Object.entries(appThemeOverrides.cssVars ?? {})) {
    document.documentElement.style.setProperty(name, value);
}

applyBrandCssVars(currentBrandColor());

useAppearanceStore.subscribe(() => applyBrandCssVars(currentBrandColor()));
// Only the canvas/sidebar half of applyBrandCssVars actually depends on
// colorMode, but recomputing the brand steps too is cheap and keeps this
// one code path instead of splitting "which half reacts to which store".
useThemeStore.subscribe(() => applyBrandCssVars(currentBrandColor()));
