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
const config: SystemConfig = {};

export default config;
