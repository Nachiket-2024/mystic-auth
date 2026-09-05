import { APP_FAVICON_URL } from "../core/settings";
import { getBrandIconDataUri } from "./brandIcon";

const DEFAULT_FAVICON_HREF = "/favicon.svg";
// Matches index.html's default, kept in sync by hand: a <meta> tag's
// content can't reference a CSS custom property.
const DEFAULT_THEME_COLOR = "#d97706";

/**
 * The favicon and `theme-color` meta tag are real DOM elements outside
 * Chakra's system, so - unlike the brand/background color scale
 * (appearanceThemeOverrides.ts + AppearanceThemeProvider.tsx, which rebuild
 * Chakra's system) - these are applied directly. Called eagerly at module
 * load and again on every setBrandColor, so wrapped defensively: a DOM
 * query failing here shouldn't take down the rest of app init.
 *
 * When APP_FAVICON_URL is set, it always wins over the generated brand-color
 * icon - a deployment that fixes its own favicon shouldn't have it overridden
 * by a signed-in user's personal brand color pick.
 */
export function applyFaviconAndMetaColor(hex: string | null): void {
    try {
        const href = APP_FAVICON_URL ?? (hex ? getBrandIconDataUri(hex) : DEFAULT_FAVICON_HREF);
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = href;

        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (meta) meta.content = hex ?? DEFAULT_THEME_COLOR;
    } catch (error) {
        console.error("applyFaviconAndMetaColor: failed to apply", error);
    }
}
