import { createSystem, defaultConfig } from "@chakra-ui/react";
import type { SystemConfig } from "@chakra-ui/react";

// App-owned re-skin point: see docs/mystic_auth/template-usage/overview.md
// and app/theme.ts's own docstring. Merged in below, after this file's own
// config, so a fork's overrides (e.g. a different `brand` scale) win without
// ever requiring an edit to this upstream-owned file.
import appThemeOverrides from "../../app/theme";
import { tokens } from "./themeTokens";
import { semanticTokens } from "./themeSemanticTokens";
import { textStyles, recipes, globalCss } from "./themeStyles";
import { buildAppearanceThemeOverrides } from "./appearanceThemeOverrides";
import { BRAND_COLOR } from "../core/settings";

/**
 * Formalizes the palette the app was already using ad hoc (teal for primary actions, gray
 * neutrals, red/green feedback) into theme tokens, so components reference tokens instead of
 * repeating raw hex/scale values.
 *
 * Assembled from themeTokens.ts (raw color/duration/spacing scale),
 * themeSemanticTokens.ts (named color roles resolved against that scale),
 * and themeStyles.ts (text styles, recipe overrides, global page CSS) -
 * split into those files purely to keep each one a manageable size; this
 * file owns only the final SystemConfig shape and its merge into
 * createSystem below.
 *
 * `as SystemConfig["theme"]`: Chakra's recursive TokenSchema type only
 * resolves an inline `_light`/`_dark` conditional shadow value (see
 * themeTokens.ts's `shadows`) when it's contextually typed as part of one
 * literal SystemConfig object, which this file's whole point is to avoid -
 * each token group needs to stay independently editable in its own file.
 * The cast is a type-checker limitation workaround, not a behavior change:
 * every value below is the same literal this repo already shipped as one
 * inline config.
 */
const config: SystemConfig = {
    theme: {
        tokens,
        semanticTokens,
        textStyles,
        recipes,
    } as unknown as SystemConfig["theme"],
    globalCss,
};

// The shipped default, exactly (Tailwind's amber scale, hand-tuned).
// generateBrandScale approximates an arbitrary hex well for a user's own
// Appearance pick, but regenerating it from this hex loses fidelity: it
// holds saturation flat across steps instead of desaturating the light end
// the way this hand-tuned scale does. A genuinely different BRAND_COLOR
// still gets the generated scale below, same as a user's own pick.
const SHIPPED_DEFAULT_BRAND_COLOR = "#d97706";
const SHIPPED_DEFAULT_BRAND_SCALE = {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
};

// The app-wide default brand scale + canvas-gradient tint: the shipped
// exact amber above when BRAND_COLOR is still that default, or generated
// from settings.ts's BRAND_COLOR (VITE_BRAND_COLOR) the same way a signed-in
// user's own Appearance pick is (generateBrandScale/deriveCanvasFrom, via
// appearanceThemeOverrides.ts) when it's been changed to something else.
// See docs/mystic_auth/template-usage/overview.md for the env var.
const brandDefault: SystemConfig =
    BRAND_COLOR.toLowerCase() === SHIPPED_DEFAULT_BRAND_COLOR
        ? {
              theme: {
                  tokens: {
                      colors: {
                          brand: Object.fromEntries(
                              Object.entries(SHIPPED_DEFAULT_BRAND_SCALE).map(([step, value]) => [step, { value }])
                          ),
                      },
                  },
                  semanticTokens: {
                      colors: {
                          "bg.canvasFrom": {
                              value: { _light: "{colors.brand.100}", _dark: "#3a2217" },
                          },
                      },
                  },
              },
          }
        : (buildAppearanceThemeOverrides({ brandColor: BRAND_COLOR }) as SystemConfig);

/**
 * Merges `config` on top of Chakra's `defaultConfig` (rather than replacing it, which is what
 * passing a bare custom config to createSystem would do) so the app keeps every default
 * token/recipe and only overrides what's listed above, then `brandDefault` (the BRAND_COLOR-derived
 * scale), then `appThemeOverrides` on top of that so a fork's own re-skin (app/theme.ts) - which is
 * empty by default - wins last without editing this file.
 *
 * Exposed as a factory (rather than only the `system` singleton below) so
 * AppearanceThemeProvider.tsx can rebuild the whole system with a signed-in
 * user's own brand/background overrides merged in last, winning over even
 * appThemeOverrides. This is the ONLY reliable way to override a
 * conditional (_light/_dark) semantic token from outside this file: Chakra
 * compiles the dark condition as a per-usage `.dark &` selector (see
 * @chakra-ui/react's preset-base.js), not a single global `:root.dark {
 * --var: x }` declaration, so setting `--chakra-colors-*` custom properties
 * from plain DOM/CSS after the fact (an earlier version of this feature
 * did exactly that) works for light mode - whose value happens to resolve
 * through an unconditional token reference - but silently fails to
 * override dark mode's value, which Chakra scopes per-instance. Rebuilding
 * the system itself sidesteps that entirely: Chakra's own compiler
 * resolves both conditions from the same config object everyone else uses,
 * so there's no indirection left to fight.
 */
export function buildSystem(userOverrides?: SystemConfig) {
    return userOverrides
        ? createSystem(defaultConfig, config, brandDefault, appThemeOverrides, userOverrides)
        : createSystem(defaultConfig, config, brandDefault, appThemeOverrides);
}

export const system = buildSystem();

// Composed from the `durations.hover`/`easings.hover` tokens (themeTokens.ts)
// via `system.token()` (which resolves to a `var(--chakra-...)` reference,
// not a literal value) so overriding either token from app/theme.ts changes
// this too, without needing to reconstruct the string. Properties list is
// fixed here rather than tokenized itself - which CSS properties need a
// hover transition is a per-component concern, not something a re-skin
// needs to retune. Value is unchanged from the original hardcoded constant
// this replaces (0.1s ease on background-color/border-color/color).
const HOVER_TRANSITION_PROPERTIES = ["background-color", "border-color", "color"];
export const FAST_HOVER_TRANSITION = HOVER_TRANSITION_PROPERTIES.map(
    (property) => `${property} ${system.token("durations.hover")} ${system.token("easings.hover")}`
).join(", ");
