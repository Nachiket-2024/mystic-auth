/**
 * Raw token scale: fonts, the brand/accent color scales, and the
 * duration/easing/radii/spacing/shadow primitives semanticTokens.ts and the
 * rest of the app reference by name. See system.ts for how this merges with
 * themeSemanticTokens.ts and themeStyles.ts into one SystemConfig.
 *
 * Deliberately untyped (no `SystemConfig["theme"]["tokens"]` annotation):
 * that indexed-access type doesn't distribute the same way over a standalone
 * object literal, which mistypes the `_light`/`_dark` shadow value below as
 * a plain string. system.ts's `config: SystemConfig` assembly still fully
 * type-checks this against Chakra's real shape.
 */
export const tokens = {
    fonts: {
        // @fontsource-variable/inter's side-effect import in main.tsx
        // registers "Inter Variable" (with a space). The rest of the
        // fallback chain is Chakra's default, so a slow first paint still
        // gets a native font instead of serif/monospace.
        heading: { value: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
        body: { value: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
    },
    colors: {
        // Always superseded at runtime by system.ts's `brandDefault`; this
        // teal scale is just the baseline that generator merges over.
        brand: {
            50: { value: "#e6fffa" },
            100: { value: "#b2f5ea" },
            200: { value: "#81e6d9" },
            300: { value: "#4fd1c5" },
            400: { value: "#38b2ac" },
            500: { value: "#319795" },
            600: { value: "#2c7a7b" },
            700: { value: "#285e61" },
            800: { value: "#234e52" },
            900: { value: "#1d4044" },
        },
        // Secondary accent (violet), distinct from brand teal, for small
        // highlights that should read as a second color, not a paler copy
        // of brand. Own token, like brand.*, so a fork can override it.
        accent: {
            50: { value: "#f5f3ff" },
            100: { value: "#ede9fe" },
            200: { value: "#ddd6fe" },
            300: { value: "#c4b5fd" },
            400: { value: "#a78bfa" },
            500: { value: "#8b5cf6" },
            600: { value: "#7c3aed" },
            700: { value: "#6d28d9" },
            800: { value: "#5b21b6" },
            900: { value: "#4c1d95" },
        },
    },
    // Hover-response timing, tokenized so it's overridable from app/theme.ts.
    // `hover` composes into FAST_HOVER_TRANSITION (system.ts); kept as
    // separate duration/easing tokens so either half overrides independently.
    durations: {
        hover: { value: "0.1s" },
        // Two more general-purpose tiers for non-hover transitions
        // (strength-meter fill, route fade-in, drawer slide). RouteProgressBar's
        // 1.1s loop is left out: it's a continuous loading loop, not a UI
        // response speed.
        fast: { value: "0.15s" },
        base: { value: "0.2s" },
    },
    easings: {
        hover: { value: "ease" },
    },
    // Density scale: names the role (corner rounding, padding/gaps), not the
    // raw scale step, so a fork can retune "how rounded/dense" without
    // hunting down every prop. Only wired into Card, PageContainer, buttons,
    // and inputs so far; the rest still uses Chakra's raw scale.
    radii: {
        // Matches Button/Input's stock default, so wiring this in is a
        // no-op until a fork overrides it.
        "density.control": { value: "{radii.l2}" },
        // Matches Card's previous hardcoded rounded="xl".
        "density.card": { value: "{radii.xl}" },
    },
    spacing: {
        "density.cardPadding": { value: "{spacing.6}" },
        "density.sectionGap": { value: "{spacing.6}" },
    },
    // Own-brand elevation, not Chakra's stock flat shadow="md": a layered
    // shadow (ambient falloff plus a tight contact shadow, with an inset
    // top-edge sheen) reads as more deliberately designed. Shared by
    // Card.tsx and StyledSelect's popover. Dark mode's alphas are tuned
    // separately since the light-mode sheen disappears against a dark
    // backdrop.
    shadows: {
        "density.card": {
            value: {
                _light: "inset 0 1px 0 0 rgba(255, 255, 255, 0.6), 0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 16px 32px -20px rgba(15, 23, 42, 0.25)",
                _dark: "inset 0 1px 0 0 rgba(255, 255, 255, 0.04), 0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 16px 32px -20px rgba(0, 0, 0, 0.6)",
            },
        },
    },
};
