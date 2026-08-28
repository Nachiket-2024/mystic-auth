/**
 * Single source of truth for the product name shown in the UI (navbar,
 * auth pages, document title); change it here once rather than hunting
 * down every hardcoded occurrence.
 */
export const APP_NAME = import.meta.env.VITE_APP_NAME;

/**
 * Optional logo image (any URL: bundled asset import, absolute path, or
 * remote URL) shown instead of the plain-text APP_NAME wherever the brand
 * mark renders (Sidebar, AuthLayout). Unset by default, so a fresh fork
 * keeps working with the text wordmark until it supplies one - no code
 * change needed, just VITE_APP_LOGO_URL.
 */
export const APP_LOGO_URL = import.meta.env.VITE_APP_LOGO_URL || undefined;

/**
 * Contact address shown on the Terms of Service / Privacy Policy pages.
 * Unset by default, in which case those pages fall back to a "replace this"
 * placeholder rather than showing a blank or fabricated address.
 */
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || undefined;

/**
 * App-wide default brand color (a single hex), fed into
 * theme/generateBrandScale.ts to build the whole `brand` token scale plus
 * the dark/light canvas-gradient tint - see theme/system.ts's `buildSystem`
 * for where this is applied. Falls back to the shipped amber (`#d97706`)
 * so a fresh fork keeps working with no `.env` changes; set VITE_BRAND_COLOR
 * to any hex to re-skin the whole app from one place, no code edit needed.
 * A signed-in user's own Appearance pick (Account Settings) still overrides
 * this per-user, the same as it overrides app/theme.ts's own tokens.
 */
export const BRAND_COLOR = import.meta.env.VITE_BRAND_COLOR || "#d97706";

const settings = {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
};

export default settings;