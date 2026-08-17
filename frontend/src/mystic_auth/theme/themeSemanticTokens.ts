/**
 * Semantic color tokens: names the *role* a color plays (brand.solid,
 * fg.muted, bg.canvas...) rather than a raw scale step, resolved against the
 * brand, accent, and gray scales in themeTokens.ts. Split out of system.ts,
 * see that file's own docstring for how the pieces are merged.
 */
export const semanticTokens = {
    colors: {
        // Primary brand action color (buttons, links, active states)
        brand: {
            solid: { value: "{colors.brand.600}" },
            contrast: { value: "white" },
            // Dark-mode aware unlike `muted` below: brand.600 text stays
            // legible on a light brand.50 surface, but on `subtle`'s dark
            // brand.900 surface (or bg.canvas/bg.surface) it's too close in
            // brightness to the background, so dark mode lightens it.
            fg: { value: { _light: "{colors.brand.600}", _dark: "{colors.brand.300}" } },
            muted: { value: "{colors.brand.100}" },
            // Soft, low-emphasis brand surface, for large areas
            // (header/footer bands) that need to read as "branded"
            // without brand.solid's high-contrast weight. Dark-mode
            // aware unlike `muted` above: a light teal-50 tint would
            // read as a jarring light patch on an otherwise dark
            // page, so dark mode uses a low-brightness brand-tinted
            // surface instead of the same light tint.
            subtle: { value: { _light: "{colors.brand.50}", _dark: "{colors.brand.900}" } },
            // One step darker/lighter than `subtle` above: `subtle` is meant for
            // large low-emphasis surfaces, but that same brand.50 tint read as
            // barely-there when reused for the sidebar's active-link background in
            // light mode. `selected` exists for small, must-be-noticed highlights
            // (nav active state, list selection) where `subtle` is too pale.
            selected: { value: { _light: "{colors.brand.100}", _dark: "{colors.brand.800}" } },
            emphasized: { value: "{colors.brand.700}" },
            focusRing: { value: "{colors.brand.500}" },
            // Chakra's own built-in colors (gray, red, ...) each auto-generate a
            // `colorPalette.border` slot that the outline Button variant reads
            // (`border-color: var(--outline-color, ...)`); a custom palette like
            // this one does not get that for free, so `variant="outline"
            // colorPalette="brand"` had no border-color value to resolve at all
            // until this was added. Same light/dark step as border.default below.
            border: { value: { _light: "{colors.brand.300}", _dark: "{colors.brand.600}" } },
        },
        // Secondary accent (violet), same slot shape as brand.* above
        // but for small highlights that want to read as deliberately
        // "a second color" - a stat's secondary badge, a page title's
        // accent underline, a chart's secondary series - rather than
        // reusing brand teal (which is reserved for primary actions/
        // active states) or a bare gray.
        accent: {
            solid: { value: "{colors.accent.600}" },
            contrast: { value: "white" },
            fg: { value: { _light: "{colors.accent.600}", _dark: "{colors.accent.300}" } },
            subtle: { value: { _light: "{colors.accent.50}", _dark: "{colors.accent.900}" } },
            emphasized: { value: "{colors.accent.700}" },
            focusRing: { value: "{colors.accent.500}" },
            // Same gap and fix as brand.border above.
            border: { value: { _light: "{colors.accent.300}", _dark: "{colors.accent.600}" } },
        },
        // Page/app surfaces
        "bg.canvas": { value: { _light: "{colors.gray.100}", _dark: "{colors.gray.900}" } },
        // Endpoints for AppLayout's/AuthLayout's canvas gradient (a very
        // soft top-of-viewport tint fading into the flat bg.canvas
        // color below), so large flat surfaces read as having some
        // depth instead of a hard, uniform fill. `From` is barely a
        // step off bg.canvas itself - just enough to be perceptible,
        // not a visible "banded" edge - and `To` IS bg.canvas, so the
        // gradient settles into the exact same flat color the rest of
        // the app (Card, dialogs) is already tuned against. Kept as
        // its own semantic token pair (not hardcoded in the gradient
        // prop itself) so a fork can override the tint via
        // app/theme.ts without touching bg.canvas's own value.
        "bg.canvasFrom": { value: { _light: "{colors.brand.50}", _dark: "{colors.gray.800}" } },
        "bg.canvasTo": { value: { _light: "{colors.gray.100}", _dark: "{colors.gray.900}" } },
        "bg.surface": { value: { _light: "white", _dark: "{colors.gray.800}" } },
        // One step darker/lighter than Chakra's stock gray.200/gray.700: those blended
        // into bg.surface/bg.canvas closely enough that table borders, card outlines,
        // and dividers were barely visible in either color mode.
        "border.default": { value: { _light: "{colors.gray.300}", _dark: "{colors.gray.600}" } },
        // Overrides Chakra's own global `border` token (used by Input/Textarea/Select's
        // outline variant, not just our own `border.default` above). Its stock dark value
        // is gray.800, identical to bg.surface's dark value, so every form field's border
        // was invisible against the card behind it. Same value as border.default above,
        // just under the key Chakra's built-in recipes actually consume.
        border: { value: { _light: "{colors.gray.300}", _dark: "{colors.gray.600}" } },
        // Text
        "fg.default": { value: { _light: "{colors.gray.700}", _dark: "{colors.gray.100}" } },
        // gray.500 on bg.canvas (gray.100) measured 4.4:1 - just under
        // WCAG AA's 4.5:1 for normal text (axe-core color-contrast
        // audit). gray.600 clears it with room to spare (7:1+) while
        // still reading as muted, not full-strength body text.
        "fg.muted": { value: { _light: "{colors.gray.600}", _dark: "{colors.gray.400}" } },
        // red.600 on TableActionButton's red.50 rest-state background
        // measured 4.41:1 - just under WCAG AA's 4.5:1 (axe-core
        // color-contrast audit). red.700 clears it (5.9:1+).
        "fg.error": { value: { _light: "{colors.red.700}", _dark: "{colors.red.400}" } },
        "fg.success": { value: { _light: "{colors.green.600}", _dark: "{colors.green.400}" } },
        // Values match what TableActionButton's orange/blue palettes
        // already hand-tuned per-instance (orange.700/blue.700 light,
        // orange.200/blue.200 dark) before these tokens existed - see
        // that file's own comments for why plain orange.700/blue.700
        // isn't dark-mode-safe on its own. Promoted here so any
        // future warning/info-colored text gets the same dark-mode
        // handling for free instead of re-deriving it per component.
        "fg.warning": { value: { _light: "{colors.orange.700}", _dark: "{colors.orange.200}" } },
        "fg.info": { value: { _light: "{colors.blue.700}", _dark: "{colors.blue.200}" } },
    },
};
