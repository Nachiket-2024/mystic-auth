/**
 * Downstream-owned. sdk.ts is upstream's fixed list of what MysticAuth exposes:
 * never edit it. If your app needs something MysticAuth has but sdk.ts does not
 * export, re-export it here straight from the MysticAuth tree, then import it
 * from "./app_sdk" in the rest of your code:
 *
 *   export { default as RouteFadeIn } from "../mystic_auth/ui/routing/RouteFadeIn";
 *
 * Keeping those imports in this one file means an upstream move is a one-line fix.
 */
