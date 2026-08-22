import type { SystemConfig } from "@chakra-ui/react";

/**
 * App-owned theme overrides (see docs/mystic_auth/template-usage/overview.md).
 *
 * Counterpart to app_sdk.ts, for the same reason: mystic_auth/theme/system.ts
 * documents itself as "change the brand scale here to re-skin the app," but
 * that file is upstream-owned, so hand-editing it directly would conflict on
 * every `scripts/sync-upstream.sh` sync. This file is merged on top of it
 * instead (see system.ts's own `createSystem(defaultConfig, config,
 * appThemeOverrides)` call), the same "yours, upstream never touches it
 * again" pattern app_sdk.ts uses.
 *
 * Empty by default, and deliberately kept that way upstream: every release
 * ships this file as an empty config, so it never conflicts on a sync. Fill
 * in your own `brand` scale (and any other token you want to override) below;
 * see https://www.chakra-ui.com/docs/theming/customization/colors for the
 * 50-900 scale shape Chakra expects.
 *
 * Example:
 *
 * const config: SystemConfig = {
 *     theme: {
 *         tokens: {
 *             colors: {
 *                 brand: {
 *                     50: { value: "#eef2ff" },
 *                     // ...
 *                     900: { value: "#1e1b4b" },
 *                 },
 *             },
 *         },
 *     },
 * };
 */
const config: SystemConfig = {
    theme: {
        tokens: {
            colors: {
                // Tailwind's "amber" scale - #d97706 (amber.600) is the
                // requested brand color, kept at its native step rather than
                // relocated, with the rest of the 50-900 scale generated
                // around it. Verified against themeSemanticTokens.ts's actual
                // pairings (WCAG 2.1 relative luminance, not eyeballed):
                //   brand.600 on white (buttons/links)        3.19:1
                //   white on brand.600 (solid button text)    3.19:1
                //   brand.700 on white (emphasized text)      5.02:1
                //   brand.300 on gray.900 (dark-mode fg)      12.43:1
                //   brand.700 on brand.200 (light active nav)  4.03:1
                //   brand.300 on brand.800 (dark active nav)   4.92:1
                // brand.600 falls short of WCAG AA's 4.5:1 for normal text -
                // #d97706 simply isn't dark enough at this hue/saturation to
                // clear that bar without darkening it away from the exact
                // requested value, so solid buttons/links using brand.600
                // only clear AA's 3:1 threshold (large text / non-text UI
                // components), not the 4.5:1 normal-text threshold. Every
                // other pairing above (700+ and dark-mode 300) clears 4.5:1
                // with margin, since those steps are generated darker/lighter
                // than the fixed #d97706 anchor.
                brand: {
                    50: { value: "#fffbeb" },
                    100: { value: "#fef3c7" },
                    200: { value: "#fde68a" },
                    300: { value: "#fcd34d" },
                    400: { value: "#fbbf24" },
                    500: { value: "#f59e0b" },
                    600: { value: "#d97706" },
                    700: { value: "#b45309" },
                    800: { value: "#92400e" },
                    900: { value: "#78350f" },
                },
            },
        },
        // Both modes override canvasFrom (themeSemanticTokens.ts's stock
        // value: brand.50 light / plain gray.800 dark, i.e. barely any
        // brand tint in either mode - tuned against the default teal scale)
        // one step deeper, so the top-of-viewport gradient actually reads
        // as "branded" instead of fading to gray/white almost immediately.
        // A prior pass here went two steps deeper in light mode
        // specifically (brand.100 *and* a darker gray.200 canvas/canvasTo)
        // - that combination read as a loud, uneven banner rather than a
        // gradient. This keeps canvasTo/bg.canvas at their stock light
        // values (gray.100) and only deepens the start color, so the light
        // gradient has real presence at the top - matching dark mode's own
        // visible navy start - while still settling into the same neutral
        // card-adjacent gray it always has.
        semanticTokens: {
            colors: {
                "bg.canvasFrom": {
                    value: {
                        _light: "{colors.brand.100}",
                        // Weighted blend of gray.900 (65%, #18181b - Chakra's
                        // stock dark gray) and brand.900 (35%, #78350f) rather
                        // than a plain brand scale step - a full-saturation
                        // brand.900 wash read as too strong at the top of a
                        // dark viewport, but plain gray.900 alone reads as
                        // flat/unbranded next to the light-mode gradient's
                        // now-visible brand.100 start.
                        _dark: "#3a2217",
                    },
                },
            },
        },
    },
};

export default config;
