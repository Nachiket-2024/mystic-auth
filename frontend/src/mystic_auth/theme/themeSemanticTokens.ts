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
            // Dark-mode aware unlike `muted`: brand.600 text is too close in
            // brightness to `subtle`'s dark brand.900 surface, so dark mode
            // lightens it.
            fg: { value: { _light: "{colors.brand.600}", _dark: "{colors.brand.300}" } },
            muted: { value: "{colors.brand.100}" },
            // Low-emphasis brand surface for large areas (header/footer
            // bands). Dark mode uses a low-brightness tint instead of the
            // same light one, which would read as a jarring patch.
            subtle: { value: { _light: "{colors.brand.50}", _dark: "{colors.brand.900}" } },
            // One step darker/lighter than `subtle`: that tint read as
            // barely-there for the sidebar's active-link background, so
            // `selected` exists for small, must-be-noticed highlights.
            selected: { value: { _light: "{colors.brand.100}", _dark: "{colors.brand.800}" } },
            emphasized: { value: "{colors.brand.700}" },
            focusRing: { value: "{colors.brand.500}" },
            // Chakra's built-in colors auto-generate a colorPalette.border
            // slot for the outline Button variant; a custom palette doesn't
            // get that for free, so this fills it in (same step as
            // border.default below).
            border: { value: { _light: "{colors.brand.300}", _dark: "{colors.brand.600}" } },
        },
        // Secondary accent (violet), same shape as brand.* but for
        // highlights that should read as "a second color" rather than
        // reusing brand or a bare gray.
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
        // Endpoints for AppLayout's/AuthLayout's canvas gradient: a soft
        // top-of-viewport tint fading into bg.canvas, so flat surfaces read
        // as having depth. `To` equals bg.canvas so the gradient settles
        // into the same flat color the rest of the app is tuned against.
        // Kept as its own token pair so a fork can override the tint
        // without touching bg.canvas itself.
        "bg.canvasFrom": { value: { _light: "{colors.brand.50}", _dark: "{colors.gray.800}" } },
        "bg.canvasTo": { value: { _light: "{colors.gray.100}", _dark: "{colors.gray.900}" } },
        "bg.surface": { value: { _light: "white", _dark: "{colors.gray.800}" } },
        // One step darker than Chakra's stock gray.300 in light mode: that
        // measured ~1.4:1 against bg.surface's white, an essentially
        // invisible border. gray.400 clears it by a wide margin. Dark mode's
        // gray.600 on gray.800 already had enough separation.
        "border.default": { value: { _light: "{colors.gray.400}", _dark: "{colors.gray.600}" } },
        // Overrides Chakra's global `border` token (Input/Textarea/Select's
        // outline variant): its stock dark value equalled bg.surface's dark
        // value, making every form field border invisible. Same value as
        // border.default, under the key Chakra's recipes actually read.
        border: { value: { _light: "{colors.gray.400}", _dark: "{colors.gray.600}" } },
        // Text
        "fg.default": { value: { _light: "{colors.gray.700}", _dark: "{colors.gray.100}" } },
        // gray.500 on bg.canvas measured 4.4:1, just under WCAG AA's 4.5:1.
        // gray.600 clears it with room to spare while still reading muted.
        "fg.muted": { value: { _light: "{colors.gray.600}", _dark: "{colors.gray.400}" } },
        // red.600 on TableActionButton's red.50 background measured 4.41:1,
        // just under WCAG AA. red.700 clears it (5.9:1+).
        "fg.error": { value: { _light: "{colors.red.700}", _dark: "{colors.red.400}" } },
        "fg.success": { value: { _light: "{colors.green.600}", _dark: "{colors.green.400}" } },
        // Light value is a literal hex, not {colors.orange.700}: that scale
        // step's hue was close enough to fg.error's red.700 that a "Medium"
        // password strength read as red, not orange, next to "Weak".
        // #ae5609 pushes into unambiguous orange while keeping ~5:1 contrast.
        "fg.warning": { value: { _light: "#ae5609", _dark: "{colors.orange.200}" } },
        "fg.info": { value: { _light: "{colors.blue.700}", _dark: "{colors.blue.200}" } },
    },
};
