import { create } from "zustand";

import { applyFaviconAndMetaColor } from "../theme/applyFaviconAndMetaColor";

interface AppearanceState {
    /** null = using the app default scale (app/theme.ts). */
    brandColor: string | null;
    /** Applies immediately (favicon/meta + localStorage cache); the brand
     * scale/background CSS itself reacts automatically since
     * AppearanceThemeProvider.tsx subscribes to this store directly. See
     * AppearanceCard.tsx for the save step, and useCurrentUserQuery.ts's
     * useAuthSession for how the server's value (once known) is applied
     * here too. */
    setBrandColor: (hex: string | null) => void;
}

const BRAND_KEY = "brand-color";

function readCached(key: string): string | null {
    return window.localStorage.getItem(key);
}

function writeCached(key: string, hex: string | null): void {
    if (hex) window.localStorage.setItem(key, hex);
    else window.localStorage.removeItem(key);
}

const initialBrandColor = readCached(BRAND_KEY);

// Applied immediately at module load, before first paint - same reasoning
// as themeStore.ts, but scoped to just the favicon/meta tag now: the brand
// scale/background themselves are applied by AppearanceThemeProvider.tsx
// rebuilding Chakra's system on its own very first render (using this same
// locally-cached guess), not via a DOM-level side effect here. This is
// only the locally cached guess either way - useAuthSession reconciles it
// against the account's real, server-stored value once GET /auth/me
// resolves.
applyFaviconAndMetaColor(initialBrandColor);

/**
 * Client-side UI preference cache (not the server state itself), same
 * "own Zustand store + localStorage" split this app already uses for
 * color mode (themeStore.ts), font size, and language.
 */
export const useAppearanceStore = create<AppearanceState>((set) => ({
    brandColor: initialBrandColor,

    setBrandColor: (hex) => {
        writeCached(BRAND_KEY, hex);
        applyFaviconAndMetaColor(hex);
        set({ brandColor: hex });
    },
}));
