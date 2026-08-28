import type { SystemConfig } from "@chakra-ui/react";

/**
 * App-owned theme overrides (see docs/mystic_auth/template-usage/overview.md).
 *
 * For the common case - just changing the brand color - you don't need this
 * file at all: set VITE_BRAND_COLOR (root .env's BRAND_COLOR, aliased the
 * same way APP_NAME is) to any hex and rebuild. mystic_auth/theme/system.ts
 * generates the whole 50-900 brand scale plus the canvas-gradient tint from
 * that one value (mystic_auth/theme/generateBrandScale.ts), the same
 * generator a signed-in user's own Appearance pick uses. See
 * docs/mystic_auth/template-usage/overview.md#environment-configuration.
 *
 * This file is for anything beyond that single color: a hand-authored scale
 * that doesn't fit the generator's lightness ladder, other token overrides
 * (fonts, radii, recipes), or global CSS. Counterpart to app_sdk.ts, for the
 * same reason: mystic_auth/theme/system.ts is upstream-owned, so hand-editing
 * it directly would conflict on every `scripts/upstream-sync/sync-upstream.sh`
 * sync. This file is merged on top of it instead (system.ts's own
 * `createSystem(defaultConfig, config, brandDefault, appThemeOverrides)`
 * call, where `brandDefault` is the BRAND_COLOR-derived scale above), the
 * same "yours, upstream never touches it again" pattern app_sdk.ts uses.
 *
 * Empty by default, and deliberately kept that way upstream: every release
 * ships this file as an empty config, so it never conflicts on a sync. Fill
 * in your own `brand` scale (and any other token you want to override) below
 * to go beyond what VITE_BRAND_COLOR alone can do; see
 * https://www.chakra-ui.com/docs/theming/customization/colors for the
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
const config: SystemConfig = {};

export default config;
