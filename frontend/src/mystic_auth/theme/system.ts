import { createSystem, defaultConfig } from "@chakra-ui/react";
import type { SystemConfig } from "@chakra-ui/react";

// App-owned re-skin point: see docs/mystic_auth/template-usage/overview.md
// and app/theme.ts. Merged in after this file's own config, so a fork's
// overrides win without editing this upstream-owned file.
import appThemeOverrides from "../../app/theme";
import { tokens } from "./themeTokens";
import { semanticTokens } from "./themeSemanticTokens";
import { textStyles, recipes, globalCss } from "./themeStyles";
import { buildAppearanceThemeOverrides } from "./appearanceThemeOverrides";
import { BRAND_COLOR } from "../core/settings";

/**
 * Formalizes the palette the app was already using ad hoc (teal for primary
 * actions, gray neutrals, red/green feedback) into theme tokens, so
 * components reference tokens instead of repeating raw hex/scale values.
 *
 * Assembled from themeTokens.ts (raw color/duration/spacing scale),
 * themeSemanticTokens.ts (named color roles), and themeStyles.ts (text
 * styles, recipe overrides, global CSS) - split purely to keep each file a
 * manageable size.
 *
 * `as SystemConfig["theme"]`: Chakra's TokenSchema type only resolves an
 * inline `_light`/`_dark` value (themeTokens.ts's `shadows`) when typed as
 * part of one literal SystemConfig object, which splitting into files avoids.
 * The cast is a type-checker workaround, not a behavior change.
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
// Regenerating this from its hex via generateBrandScale loses fidelity (it
// holds saturation flat instead of desaturating the light end), so the
// literal scale is kept here. A different BRAND_COLOR still gets the
// generated scale below.
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

// The app-wide default brand scale + canvas-gradient tint: the shipped exact
// amber above when BRAND_COLOR is unchanged, or generated from
// settings.ts's BRAND_COLOR (VITE_BRAND_COLOR) otherwise, the same way a
// user's own Appearance pick is. See
// docs/mystic_auth/template-usage/overview.md for the env var.
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
 * Merges `config` on top of Chakra's `defaultConfig` (rather than replacing
 * it) so the app keeps every default token/recipe and only overrides what's
 * listed above, then `brandDefault`, then `appThemeOverrides` last so a
 * fork's re-skin (app/theme.ts, empty by default) wins.
 *
 * Exposed as a factory so AppearanceThemeProvider.tsx can rebuild the whole
 * system with a signed-in user's brand/background overrides merged in last.
 * This is the only reliable way to override a conditional (_light/_dark)
 * semantic token from outside this file: Chakra compiles the dark condition
 * as a per-usage `.dark &` selector, not a single global rule, so setting
 * `--chakra-colors-*` custom properties from plain DOM/CSS after the fact
 * (an earlier version did this) works for light mode but silently fails for
 * dark. Rebuilding the system sidesteps that: Chakra's compiler resolves
 * both conditions from the same config object everyone else uses.
 */
export function buildSystem(userOverrides?: SystemConfig) {
    return userOverrides
        ? createSystem(defaultConfig, config, brandDefault, appThemeOverrides, userOverrides)
        : createSystem(defaultConfig, config, brandDefault, appThemeOverrides);
}

export const system = buildSystem();

// Composed from the `durations.hover`/`easings.hover` tokens via
// `system.token()` (resolves to a `var(--chakra-...)` reference), so
// overriding either token from app/theme.ts changes this too. The property
// list itself isn't tokenized: which CSS properties need a hover transition
// is a per-component concern, not something a re-skin needs to retune.
const HOVER_TRANSITION_PROPERTIES = ["background-color", "border-color", "color"];
export const FAST_HOVER_TRANSITION = HOVER_TRANSITION_PROPERTIES.map(
    (property) => `${property} ${system.token("durations.hover")} ${system.token("easings.hover")}`
).join(", ");
