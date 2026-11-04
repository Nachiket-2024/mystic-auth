import { APP_FAVICON_URL, BRAND_COLOR } from "../core/settings";
import { getBrandIconDataUri } from "./brandIcon";

const DEFAULT_FAVICON_HREF = "/favicon.svg";

/**
 * The favicon and `theme-color` meta tag are real DOM elements outside the
 * CSS-variable theme, so they are applied directly: eagerly at module load and
 * on every setBrandColor, wrapped defensively so a failed DOM query cannot take
 * down app init.
 *
 * When APP_FAVICON_URL is set it always wins over the generated brand-color
 * icon, so a user's personal brand pick never overrides a deployment's favicon.
 */
export function applyFaviconAndMetaColor(hex: string | null): void {
    try {
        const href = APP_FAVICON_URL ?? (hex ? getBrandIconDataUri(hex) : DEFAULT_FAVICON_HREF);
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = href;

        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (meta) meta.content = hex ?? BRAND_COLOR;
    } catch (error) {
        console.error("applyFaviconAndMetaColor: failed to apply", error);
    }
}
