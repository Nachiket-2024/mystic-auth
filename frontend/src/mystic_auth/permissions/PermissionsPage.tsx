import React, { useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import PageContainer from "../ui/PageContainer";
import DataTable from "../ui/DataTable/DataTable";
import Pagination from "../ui/Pagination";
import { useDebouncedValue } from "../ui/hooks/useDebouncedValue";
import { useSortState } from "../ui/hooks/useSortState";
import { usePageResetOn } from "../ui/hooks/usePageResetOn";
import { usePermissionCatalogQuery } from "../policies/queries/permissionQueries";
import PermissionsFilterBar, { ALL_VALUE } from "./PermissionsFilterBar";
import PermissionDetailsDialog from "./PermissionDetailsDialog";
import { buildPermissionsColumns } from "./permissionsColumns";
import type { PermissionCatalogEntry } from "../api/permissions_api";

const PAGE_SIZE = 25;

/**
 * PermissionsPage
 * ----------------------------
 * Read-only, browsable view of the fixed, code-defined permission catalog
 * (backend: GET /authorization/permissions/catalog - see
 * authorization/permissions_catalog.py). Deliberately separate from
 * PoliciesPage rather than a tab on it, for clarity: this is the closed
 * action vocabulary developers define, Policies is how admins compose it.
 * No create/edit/delete here - a permission only means something once a
 * route in the backend checks for it, so there is nothing an admin can
 * legitimately "manage" here.
 *
 * Search/filter/sort/paginate all run client-side against the single,
 * already-fully-loaded catalog (~20 static rows, long staleTime - see
 * usePermissionCatalogQuery) rather than round-tripping to the server per
 * page/sort/filter the way PoliciesPage's much larger, mutable list does -
 * same DataTable/Pagination/StyledSelect components, so the UX matches every
 * other page exactly.
 *
 * Reads an initial `?search=` query param the same way AuditLogPage reads
 * `?category=`/`?scope=` - CommandPaletteResults' catalog-entry matches
 * (layout/command_palette/CommandPaletteResults.ts) link here with the
 * matched action so landing on the page already shows it, not just an
 * empty search box.
 */
const PermissionsPage: React.FC = () => {
    const { t } = useTranslation(["permissions", "ui_text"]);

    const [searchParams] = useSearchParams();
    const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
    const debouncedSearch = useDebouncedValue(search);
    const { sort, toggleSort } = useSortState("action", "asc");
    const [resourceType, setResourceType] = useState(ALL_VALUE);

    const [page, setPage] = usePageResetOn(`${debouncedSearch}|${sort.key}|${sort.direction}|${resourceType}`);

    const { data: catalog, isLoading, isError } = usePermissionCatalogQuery();

    const [viewingEntry, setViewingEntry] = useState<PermissionCatalogEntry | null>(null);

    const filteredSorted = useMemo(() => {
        const query = debouncedSearch.trim().toLowerCase();
        const filtered = (catalog ?? []).filter((entry) => {
            if (resourceType !== ALL_VALUE && entry.resource_type !== resourceType) return false;
            if (!query) return true;
            return entry.action.toLowerCase().includes(query) || entry.description.toLowerCase().includes(query);
        });
        const key = sort.key as keyof PermissionCatalogEntry;
        const sorted = [...filtered].sort((a, b) => {
            const cmp = a[key].localeCompare(b[key]);
            return sort.direction === "asc" ? cmp : -cmp;
        });
        return sorted;
    }, [catalog, debouncedSearch, resourceType, sort]);

    const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
    const pageRows = filteredSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const columns = buildPermissionsColumns({ t, onView: setViewingEntry });

    const hasSearchOrFilters = !!search || resourceType !== ALL_VALUE;

    return (
        <PageContainer
            title={t("permissions:page.title")}
            icon={KeyRound}
            description={t("permissions:page.description")}
            headerExtra={
                <PermissionsFilterBar
                    search={search}
                    setSearch={setSearch}
                    resourceType={resourceType}
                    setResourceType={setResourceType}
                />
            }
        >
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mb={4} />

            <DataTable
                columns={columns}
                rows={pageRows}
                rowKey={(entry) => `${entry.action}:${entry.resource_type}`}
                isLoading={isLoading}
                isError={isError}
                errorMessage={t("permissions:page.failedToLoadPermissions")}
                emptyMessage={
                    hasSearchOrFilters
                        ? t("permissions:page.noPermissionsMatchFilters")
                        : t("permissions:page.noPermissionsYet")
                }
                sort={sort}
                onSortChange={toggleSort}
                startIndex={(page - 1) * PAGE_SIZE}
            />

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mt={4} />

            <PermissionDetailsDialog
                isOpen={!!viewingEntry}
                entry={viewingEntry}
                onClose={() => setViewingEntry(null)}
            />
        </PageContainer>
    );
};

export default PermissionsPage;
