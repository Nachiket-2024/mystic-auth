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

const settings = {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
};

export default settings;