import { getBrandIconDataUri } from "./brandIcon";

const DEFAULT_FAVICON_HREF = "/favicon.svg";
// Matches index.html's own default (kept in sync by hand: this is the one
// other place the same #d97706 default literal has to live, since a
// <meta> tag's content can't reference a CSS custom property).
const DEFAULT_THEME_COLOR = "#d97706";

/**
 * The favicon and the `theme-color` meta tag are real DOM elements outside
 * Chakra's system entirely, so - unlike the brand/background color scale
 * itself (see appearanceThemeOverrides.ts + AppearanceThemeProvider.tsx,
 * which rebuild Chakra's own system rather than fight its CSS variables) -
 * these two are still applied directly. Called eagerly at module load
 * (appearanceStore.ts) before React's first paint, and again on every
 * setBrandColor, so wrapped defensively: a DOM query failing here should
 * never be able to take the rest of app init down with it.
 */
export function applyFaviconAndMetaColor(hex: string | null): void {
    try {
        const href = hex ? getBrandIconDataUri(hex) : DEFAULT_FAVICON_HREF;
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = href;

        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (meta) meta.content = hex ?? DEFAULT_THEME_COLOR;
    } catch (error) {
        console.error("applyFaviconAndMetaColor: failed to apply", error);
    }
}
