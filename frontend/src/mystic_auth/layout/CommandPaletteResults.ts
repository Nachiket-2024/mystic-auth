import React, { useMemo } from "react";
import { LayoutDashboard, ScrollText, Settings, ShieldCheck, Users } from "lucide-react";

import { useAuthorization } from "../authorization/useAuthorization";
import { PERMISSIONS } from "../authorization/permissions";
import { NAV_ITEMS, type NavItem } from "./navItems";
import { SEARCH_ITEMS, PAGE_CONTENT_NAMESPACES, type SearchItem } from "./searchItems";
import { useLanguageStore } from "../store/languageStore";
import translations from "../translations/translations";
import { namespaceMatches, namespaceSearchText, scopedMatches, scopedSearchText } from "../translations/searchText";
import { useUsersQuery } from "../users/userQueries";

const USER_RESULTS_LIMIT = 5;
const TEXT_MATCH_RESULTS_LIMIT = 20;

// Same routes as Sidebar's NAV_ITEMS, keyed by `to` so this stays in sync
// with navItems.ts without needing its own parallel route list - if a
// built-in nav item is ever added/removed there, only this icon map needs a
// matching entry (a missing one just renders no icon, not a crash).
const ROUTE_ICONS: Record<string, React.ElementType> = {
    "/dashboard": LayoutDashboard,
    "/users": Users,
    "/policies": ShieldCheck,
    "/audit-log": ScrollText,
    "/account-settings": Settings,
};

export type ResultKind = "page" | "content" | "match" | "user";

export interface Result {
    kind: ResultKind;
    to: string;
    label: string;
    sublabel?: string;
    icon?: React.ElementType;
}

export const GROUP_LABEL_KEY: Record<ResultKind, string> = {
    page: "commandPalette.pagesGroup",
    content: "commandPalette.featuresGroup",
    match: "commandPalette.matchesGroup",
    user: "commandPalette.usersGroup",
};

/**
 * Builds CommandPalette's four result groups (pages, in-page features,
 * Ctrl+F-style text matches, and live user search) for a given query. Pulled
 * out of CommandPalette.tsx so that file only owns the dialog UI/keyboard
 * navigation - see CommandPalette.tsx's own docstring for what each group
 * actually searches and why.
 */
export function useCommandPaletteResults(
    trimmedQuery: string,
    extraNavItems: NavItem[] | undefined,
    extraSearchItems: SearchItem[] | undefined
) {
    const { can } = useAuthorization();
    const q = trimmedQuery.toLowerCase();

    // Nav/content item labels are chrome, not page content pulled from the
    // page-language store - same reasoning as Sidebar's own resolveLabel
    // (see its docstring). Plain (non-translation-key) strings, e.g. an
    // app's own extraNavItems/extraSearchItems, pass through unchanged.
    const chromeLanguage = useLanguageStore((s) => s.chromeLanguage);
    const tChrome = translations.getFixedT(chromeLanguage, "layout");
    const resolveLabel = (label: string): string =>
        translations.exists(label, { lng: chromeLanguage }) ? tChrome(label) : label;

    // {result, haystack} built once per language/permission change (not per
    // keystroke, since flattening a whole translation namespace each time
    // would be wasteful), then just an `.includes(q)` scan below. haystack
    // sweeps each page's full i18next namespace (PAGE_CONTENT_NAMESPACES),
    // not just its nav label, so any word visible on that page surfaces it.
    const pageIndex = useMemo(
        () =>
            [...NAV_ITEMS, ...(extraNavItems ?? [])]
                .filter((item) => !item.permission || can(item.permission))
                .map((item) => {
                    const label = resolveLabel(item.label);
                    const namespaces = PAGE_CONTENT_NAMESPACES[item.to] ?? [];
                    const haystack = [label, ...namespaces.map((ns) => namespaceSearchText(ns, chromeLanguage))]
                        .join(" ")
                        .toLowerCase();
                    return {
                        result: { kind: "page", to: item.to, label, icon: item.icon ?? ROUTE_ICONS[item.to] } as Result,
                        haystack,
                    };
                }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chromeLanguage, can, extraNavItems]
    );

    const filteredPages = useMemo(() => {
        if (!q) return pageIndex.map(({ result }) => result);
        return pageIndex.filter(({ haystack }) => haystack.includes(q)).map(({ result }) => result);
    }, [pageIndex, q]);

    // Same {result, haystack} precompute as pageIndex above. Each item's
    // haystack folds in its `scope` sweep (every string under the given
    // dot-paths in that namespace, e.g. every field/button/helper-text on
    // the Change Password tab) plus any one-off `matchKeys`, so typing any
    // word actually rendered in that section finds it, not just its label.
    const contentIndex = useMemo(
        () =>
            [...SEARCH_ITEMS, ...(extraSearchItems ?? [])]
                .filter((item) => !item.permission || can(item.permission))
                .map((item) => {
                    const label = resolveLabel(item.label);
                    const group = resolveLabel(item.group);
                    const detail = item.detail ? resolveLabel(item.detail) : undefined;
                    const scopeText = item.scope ? scopedSearchText(item.scope.namespace, chromeLanguage, item.scope.paths) : "";
                    const haystack = [label, detail, group, scopeText, ...(item.matchKeys ?? []).map(resolveLabel)]
                        .join(" ")
                        .toLowerCase();
                    return {
                        result: {
                            kind: "content",
                            to: item.to,
                            label,
                            sublabel: detail ? `${group} · ${detail}` : group,
                            icon: item.icon,
                        } as Result,
                        haystack,
                    };
                }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chromeLanguage, can, extraSearchItems]
    );

    // Content results only surface once there's a query - unlike pages, the
    // full built-in list would otherwise dump 8+ extra rows into the
    // palette's default (empty-query) view, which nobody's looking for yet.
    const filteredContent = useMemo(() => {
        if (!q) return [];
        return contentIndex.filter(({ haystack }) => haystack.includes(q)).map(({ result }) => result);
    }, [contentIndex, q]);

    // Ctrl+F-style results: every distinct string rendered anywhere across
    // all pages that contains the query, each as its own row, rather than
    // collapsed into one row per page/feature like filteredPages/
    // filteredContent above. Sweeps the same sources those two already
    // sweep. Deduped by (destination, text) since the same string can
    // legitimately repeat (e.g. shared button copy), and capped so a common
    // word doesn't dump dozens of rows.
    const textMatches = useMemo(() => {
        if (!q) return [];
        const seen = new Set<string>();
        const results: Result[] = [];
        const pushMatch = (to: string, text: string, sublabel: string, icon?: React.ElementType) => {
            const key = `${to} ${text}`;
            if (seen.has(key)) return;
            seen.add(key);
            results.push({ kind: "match", to, label: text, sublabel, icon });
        };

        for (const item of [...NAV_ITEMS, ...(extraNavItems ?? [])]) {
            if (item.permission && !can(item.permission)) continue;
            const namespaces = PAGE_CONTENT_NAMESPACES[item.to] ?? [];
            if (namespaces.length === 0) continue;
            const pageLabel = resolveLabel(item.label);
            const icon = item.icon ?? ROUTE_ICONS[item.to];
            for (const ns of namespaces) {
                for (const text of namespaceMatches(ns, chromeLanguage, q)) {
                    pushMatch(item.to, text, pageLabel, icon);
                }
            }
        }

        for (const item of [...SEARCH_ITEMS, ...(extraSearchItems ?? [])]) {
            if (item.permission && !can(item.permission)) continue;
            if (!item.scope) continue;
            const group = resolveLabel(item.group);
            for (const text of scopedMatches(item.scope.namespace, chromeLanguage, item.scope.paths, q)) {
                pushMatch(item.to, text, group, item.icon);
            }
        }

        return results.slice(0, TEXT_MATCH_RESULTS_LIMIT);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, chromeLanguage, can, extraNavItems, extraSearchItems]);

    // Users are real account data, not app chrome like NAV_ITEMS/SEARCH_ITEMS
    // - matched server-side (same `search` param/endpoint UsersPage.tsx
    // uses) rather than against any locally-held list, and only for callers
    // who could already reach the Users page (users:list_all), same gating
    // Sidebar/NAV_ITEMS apply to that link.
    const canSearchUsers = can(PERMISSIONS.USERS_LIST_ALL);
    const { data: userResults } = useUsersQuery(
        1,
        USER_RESULTS_LIMIT,
        { search: trimmedQuery },
        canSearchUsers && trimmedQuery.length > 0
    );

    const filteredUsers = useMemo(
        () =>
            (canSearchUsers && trimmedQuery ? userResults?.users ?? [] : []).map(
                (u): Result => ({
                    kind: "user",
                    to: `/users?search=${encodeURIComponent(u.email)}`,
                    label: u.name,
                    sublabel: u.email,
                    icon: Users,
                })
            ),
        [canSearchUsers, trimmedQuery, userResults]
    );

    const filtered = useMemo(
        () => [...filteredPages, ...filteredContent, ...textMatches, ...filteredUsers],
        [filteredPages, filteredContent, textMatches, filteredUsers]
    );
    // Only worth a group header once there are two-plus kinds of result to
    // tell apart - a lone "Pages" header over an all-pages list (the
    // common case: empty/page-only query) is just noise.
    const kindCount = useMemo(() => new Set(filtered.map((item) => item.kind)).size, [filtered]);

    return { filtered, kindCount };
}
