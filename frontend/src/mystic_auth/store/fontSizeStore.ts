import { create } from "zustand";

export type FontSize = "small" | "medium" | "large";

export const FONT_SIZES: FontSize[] = ["small", "medium", "large"];

// Percent of the browser's own default font-size, not a fixed px value -
// this way a visitor who's already bumped their browser/OS text size for
// accessibility gets that preference scaled, rather than overridden outright
// by a fixed 14/16/18px that ignores it.
const FONT_SIZE_PERCENT: Record<FontSize, string> = {
    small: "87.5%",
    medium: "100%",
    large: "112.5%",
};

interface FontSizeState {
    fontSize: FontSize;
    increaseFontSize: () => void;
    decreaseFontSize: () => void;
    setFontSize: (size: FontSize) => void;
}

const STORAGE_KEY = "font-size";

function getInitialFontSize(): FontSize {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "small" || stored === "medium" || stored === "large") return stored;
    return "medium";
}

/**
 * Scales the root <html> font-size, which every Chakra recipe's rem-based
 * sizing is relative to (text, spacing, icon sizes alike), rather than
 * overriding components one by one, so this single variable resizes the
 * whole app's UI consistently, the same "one root-level switch" approach
 * themeStore.ts uses for the `.dark` class.
 */
function applyFontSize(size: FontSize): void {
    document.documentElement.style.fontSize = FONT_SIZE_PERCENT[size];
}

// Apply immediately at module load, same reasoning as themeStore.ts: this
// module is imported eagerly at the top of main.tsx so the persisted size
// is applied before first paint, avoiding a flash of the default size.
const initialFontSize = getInitialFontSize();
applyFontSize(initialFontSize);

/**
 * Client-side UI preference (not server state), so it lives in Zustand
 * alongside themeStore/languageStore rather than TanStack Query.
 */
export const useFontSizeStore = create<FontSizeState>((set, get) => ({
    fontSize: initialFontSize,

    setFontSize: (size) => {
        window.localStorage.setItem(STORAGE_KEY, size);
        applyFontSize(size);
        set({ fontSize: size });
    },

    increaseFontSize: () => {
        const idx = FONT_SIZES.indexOf(get().fontSize);
        get().setFontSize(FONT_SIZES[Math.min(idx + 1, FONT_SIZES.length - 1)]);
    },

    decreaseFontSize: () => {
        const idx = FONT_SIZES.indexOf(get().fontSize);
        get().setFontSize(FONT_SIZES[Math.max(idx - 1, 0)]);
    },
}));
