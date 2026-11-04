export interface AppThemeOverrides {
    /** A hand-picked brand hex, overriding VITE_BRAND_COLOR at build time
     * without editing env/mystic_auth/.env.dev. theme/applyBrandCssVars.ts runs
     * this through the same generateBrandScale.ts 50-900 ladder a signed-in
     * user's own Appearance pick uses, so it's still just one hex, not a
     * hand-authored scale. */
    brandColor?: string;
    /** Any other theme/tailwind-tokens.css custom property to override outright
     * (fonts, radii, a hand-authored token that doesn't fit
     * generateBrandScale's lightness ladder), applied once at startup.
     * Doesn't take a light/dark pair: for a token that differs by mode
     * (like the brand-derived --bg-canvas-from/--bg-sidebar), override
     * generateBrandScale.ts's formula instead - a single literal here would
     * apply to both modes. */
    cssVars?: Record<string, string>;
}

/**
 * App-owned theme overrides (see docs/mystic_auth/template-usage/overview.md).
 *
 * To change only the brand color, set VITE_BRAND_COLOR (BRAND_COLOR in the env
 * file) to any hex and rebuild; you do not need this file.
 *
 * Use this file for anything beyond that. `cssVars` is applied on top of the
 * upstream-owned theme files, so you never hand-edit them and never conflict
 * with a sync. A signed-in user's own Appearance pick still overrides
 * `brandColor` for that user. Ships empty.
 *
 * Example:
 *
 * const overrides: AppThemeOverrides = {
 *     brandColor: "#4338ca",
 *     cssVars: { "--radius-control": "0.25rem" },
 * };
 */
const overrides: AppThemeOverrides = {};

export default overrides;
