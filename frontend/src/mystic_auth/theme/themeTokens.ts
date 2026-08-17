/**
 * Raw token scale: fonts, the brand/accent color scales, and the
 * duration/easing/radii/spacing/shadow primitives semanticTokens.ts and the
 * rest of the app reference by name. Split out of system.ts, which merges
 * this alongside themeSemanticTokens.ts and themeStyles.ts into one
 * SystemConfig.
 *
 * Deliberately untyped (no `SystemConfig["theme"]["tokens"]` annotation):
 * that indexed-access type doesn't distribute the same way over a
 * standalone object literal as it does over an inline SystemConfig literal,
 * which mistypes the `_light`/`_dark` shadow value below as a plain string.
 * system.ts's own `config: SystemConfig` assembly still fully type-checks
 * this object against Chakra's real shape.
 */
export const tokens = {
    fonts: {
        // The @fontsource-variable/inter side-effect import in main.tsx
        // registers the family as "Inter Variable" (with a space - see
        // that package's own index.css) - the rest of the stack is
        // Chakra's own default fallback chain, kept as-is so a system
        // without the webfont loaded (or a slow first paint) still
        // gets a normal native font instead of serif/monospace.
        heading: { value: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
        body: { value: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
    },
    colors: {
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
        // Secondary accent, distinct in hue (violet) from the brand
        // teal - for small, deliberate highlights (e.g. a stat's
        // secondary badge, an accent underline on a page title) that
        // want to read as "a second, considered color," not just a
        // paler copy of brand. Kept as its own token rather than a
        // one-off hex value wherever it's used, same reasoning as
        // brand.*, so a fork can still override it from app/theme.ts.
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
    // Hover-response timing, tokenized (rather than a hardcoded
    // string constant) so it's overridable from app/theme.ts the
    // same way brand/accent colors above are. `hover` composes into
    // the full CSS transition string exported as
    // FAST_HOVER_TRANSITION (system.ts) - kept as separate duration/
    // easing tokens (Chakra's own token categories) rather than one
    // opaque string token, so either half can be overridden
    // independently.
    durations: {
        hover: { value: "0.1s" },
        // Two more general-purpose tiers, same "retunable from
        // app/theme.ts" reasoning as `hover` above, for the
        // non-hover transitions (strength-meter fill, stat tile
        // hover wash, route fade-in, mobile drawer slide) that used
        // to each hardcode their own one-off duration literal
        // instead of sourcing from a shared token. Values match
        // what those call sites already used (0.15s / 0.2s), not
        // newly invented numbers. RouteProgressBar's 1.1s loop
        // animation is deliberately left out of this scale - it's a
        // continuous indeterminate-loading loop, not a UI response
        // speed, so it doesn't belong on a "how snappy does the app
        // feel" dial the way these do.
        fast: { value: "0.15s" },
        base: { value: "0.2s" },
    },
    easings: {
        hover: { value: "ease" },
    },
    // Density scale: same idea as the color layer in
    // themeSemanticTokens.ts (name the role, not the raw scale step), for
    // the two most commonly hand-set geometry values across components -
    // corner rounding and padding/gaps - so a fork can retune "how
    // rounded/dense does this app feel" from app/theme.ts without hunting
    // down every `rounded=`/`p=`/`gap=` prop individually. Only wired into
    // the highest-visibility surfaces so far (Card, PageContainer, buttons,
    // inputs via themeStyles.ts's recipes) - the rest of the app still uses
    // Chakra's raw scale directly and can be migrated onto these same
    // tokens incrementally, call site by call site, as they're touched.
    radii: {
        // Matches Button/Input's stock default ("l2") exactly, so
        // wiring the recipes in themeStyles.ts into this token is a no-op
        // until a fork actually overrides it from app/theme.ts.
        "density.control": { value: "{radii.l2}" },
        // Matches Card's previous hardcoded rounded="xl" exactly, same reasoning.
        "density.card": { value: "{radii.xl}" },
    },
    spacing: {
        "density.cardPadding": { value: "{spacing.6}" },
        "density.sectionGap": { value: "{spacing.6}" },
    },
    // Own-brand elevation, not Chakra's stock shadow="md" (a single
    // flat drop shadow every default Chakra app ships with
    // unchanged) - a layered shadow (soft ambient falloff plus a
    // tight contact shadow) reads as more deliberately "designed"
    // the way Linear/Vercel-tier surfaces do, and the inset
    // top-edge line adds a subtle sheen that a single boxShadow
    // value can't. Used by both Card.tsx and StyledSelect's popover
    // content so every elevated surface in the app shares one
    // look. Dark mode's inset line and shadow alphas are tuned
    // separately (a white sheen line and shadow alphas built for a
    // light backdrop both disappear or read wrong against a dark
    // one) - same _light/_dark pattern the color tokens use.
    shadows: {
        "density.card": {
            value: {
                _light: "inset 0 1px 0 0 rgba(255, 255, 255, 0.6), 0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 16px 32px -20px rgba(15, 23, 42, 0.25)",
                _dark: "inset 0 1px 0 0 rgba(255, 255, 255, 0.04), 0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 16px 32px -20px rgba(0, 0, 0, 0.6)",
            },
        },
    },
};
