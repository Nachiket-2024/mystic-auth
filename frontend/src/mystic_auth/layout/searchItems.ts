import { IdCard, KeyRound, Laptop, ScrollText, ShieldCheck, type LucideIcon } from "lucide-react";

import { PERMISSIONS } from "../authorization/permissions";
import type { Namespace } from "../translations/translations";

/**
 * A single result CommandPalette's content search can surface: a specific
 * feature/section *within* a page (e.g. "Change Password" inside Account
 * Settings), as opposed to NavItem (navItems.ts), which is a whole page.
 * Results render grouped separately ("Pages" vs "Features"), but share the
 * same permission-gating and "namespace:key" translation convention.
 */
export interface SearchItem {
    /** Either a plain display string or an i18next "namespace:key" -
     * resolved the same way NavItem.label is (see CommandPalette's
     * resolveLabel). This item's primary display text. */
    label: string;
    /** Secondary display text shown under `label`, e.g. distinguishing two
     * items that share a `label` ("Authorization decisions" for both the
     * "My activity" and "All users" results). Same "namespace:key"/plain-
     * string convention as `label`. Falls back to `group` when omitted, so
     * every result still shows page context even without a bespoke detail
     * string. */
    detail?: string;
    /** The page/section this item belongs to (e.g. "layout:nav.dashboard"),
     * shown as `detail`'s fallback and folded into the search text, so
     * typing the page's own name also surfaces its content. Same
     * "namespace:key"/plain-string convention as `label`. */
    group: string;
    /** Extra translation keys/plain strings folded into this item's search
     * text without being displayed - e.g. a related button/field label, so
     * typing a related word also matches this item via that string, without
     * a separate visible keyword list to keep in sync by hand. Prefer
     * `scope` (below) when your app has an i18next namespace to sweep
     * instead: it doesn't need updating every time that namespace's copy
     * changes. */
    matchKeys?: string[];
    /** Sweeps every string under these dot-paths within one i18next
     * namespace into this item's (invisible) search text - e.g.
     * `{ namespace: "account_settings", paths: ["tabs.password",
     * "changePassword"] }` matches any word from the Change Password tab's
     * actual rendered copy (field labels, helper text, button text, ...),
     * not just a hand-picked subset, and stays in sync automatically as
     * that copy changes. Combine with `matchKeys` for one-off extra terms
     * that live in a different namespace. */
    scope?: { namespace: Namespace; paths: string[] };
    /** Destination, e.g. "/account-settings?tab=password" or
     * "/dashboard#manage-sessions" - a query param a page reads once on
     * mount to select a tab (see AccountSettingsPage/AuditLogPage), or a
     * `#hash` AppLayout's useScrollToHash scrolls to once it's in the DOM. */
    to: string;
    /** Omit for items every authenticated user should see. */
    permission?: string;
    icon?: LucideIcon;
}

/**
 * Single source of truth for the palette's built-in content-search results.
 * Downstream apps add their own via CommandPalette's `extraSearchItems`
 * prop (same SearchItem shape, re-exported from sdk.ts) rather than editing
 * this array directly, see
 * docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points.
 */
export const SEARCH_ITEMS: SearchItem[] = [
    {
        label: "account_settings:tabs.password",
        group: "account_settings:pageTitle",
        scope: { namespace: "account_settings", paths: ["tabs.password", "changePassword"] },
        to: "/account-settings?tab=password",
        icon: KeyRound,
    },
    {
        label: "account_settings:tabs.profile",
        group: "account_settings:pageTitle",
        scope: { namespace: "account_settings", paths: ["tabs.profile", "profileName"] },
        to: "/account-settings?tab=profile",
        icon: IdCard,
    },
    {
        label: "account_settings:tabs.status",
        group: "account_settings:pageTitle",
        scope: { namespace: "account_settings", paths: ["tabs.status", "accountStatus"] },
        to: "/account-settings?tab=status",
        icon: ShieldCheck,
    },
    {
        label: "dashboard:manageSessions.heading",
        group: "layout:nav.dashboard",
        scope: { namespace: "dashboard", paths: ["manageSessions", "logoutAllButton", "parseUserAgent"] },
        to: "/dashboard#manage-sessions",
        icon: Laptop,
    },
    {
        label: "audit_log:tabs.authorizationDecisions",
        detail: "audit_log:tabs.myActivity",
        group: "audit_log:page.title",
        scope: { namespace: "audit_log", paths: ["tabs.authorizationDecisions", "tabs.myActivity", "authorization"] },
        to: "/audit-log?category=authorization&scope=mine",
        icon: ScrollText,
    },
    {
        label: "audit_log:tabs.authorizationDecisions",
        detail: "audit_log:tabs.allUsers",
        group: "audit_log:page.title",
        scope: { namespace: "audit_log", paths: ["tabs.authorizationDecisions", "tabs.allUsers", "authorization"] },
        to: "/audit-log?category=authorization&scope=all",
        permission: PERMISSIONS.POLICIES_READ,
        icon: ScrollText,
    },
    {
        label: "audit_log:tabs.securityEvents",
        detail: "audit_log:tabs.myActivity",
        group: "audit_log:page.title",
        scope: { namespace: "audit_log", paths: ["tabs.securityEvents", "tabs.myActivity", "security"] },
        to: "/audit-log?category=security&scope=mine",
        icon: ScrollText,
    },
    {
        label: "audit_log:tabs.securityEvents",
        detail: "audit_log:tabs.allUsers",
        group: "audit_log:page.title",
        scope: { namespace: "audit_log", paths: ["tabs.securityEvents", "tabs.allUsers", "security"] },
        to: "/audit-log?category=security&scope=all",
        permission: PERMISSIONS.SECURITY_AUDIT_READ,
        icon: ScrollText,
    },
];

/**
 * Which i18next namespace(s) hold a built-in page's own rendered copy
 * (column headers, filter labels, button/toast text, ...), swept into that
 * page's "Pages" result the same way SearchItem.scope sweeps a "Features"
 * result - so e.g. typing "purge" or "reactivate" (real strings on the
 * Users page, but not its own nav label) still surfaces "Users", not just
 * an exact match on the word "Users" itself. Keyed by route, not label, so
 * it stays correct regardless of NAV_ITEMS' own label/translation-key
 * choice. Pages without an entry here (or an app's own extraNavItems) only
 * match by their nav label, same as before this map existed.
 */
export const PAGE_CONTENT_NAMESPACES: Partial<Record<string, Namespace[]>> = {
    "/dashboard": ["dashboard"],
    "/users": ["users"],
    "/policies": ["policies"],
    "/audit-log": ["audit_log"],
    "/account-settings": ["account_settings"],
};
