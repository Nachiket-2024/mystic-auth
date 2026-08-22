import React, { useState } from "react";
import { Button } from "@chakra-ui/react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import PageContainer from "../ui/PageContainer";
import DataTable from "../ui/DataTable/DataTable";
import Pagination from "../ui/Pagination";
import ConfirmDialog from "../ui/ConfirmDialog";
import { BRAND_SOLID_HOVER_PROPS } from "../ui/styles/buttonStyles";
import { IfCan } from "../authorization/IfCan";
import { PERMISSIONS } from "../authorization/permissions";
import { useDebouncedValue } from "../ui/hooks/useDebouncedValue";
import { useSortState } from "../ui/hooks/useSortState";
import { usePageResetOn } from "../ui/hooks/usePageResetOn";
import { toaster } from "../ui/toaster/toasterInstance";
import { usePoliciesQuery, usePoliciesListQuery } from "./policyQueries";
import { useCreatePolicyMutation, useUpdatePolicyMutation, useDeletePolicyMutation } from "./policyMutations";
import PolicyFormDialog, { type PolicyFormValues } from "./PolicyFormDialog";
import PolicyDetailsDialog from "./PolicyDetailsDialog";
import PolicyStatsCard from "./PolicyStatsCard";
import PoliciesFilterBar, { ALL_VALUE } from "./PoliciesFilterBar";
import { buildPoliciesColumns } from "./policiesColumns";
import type { PolicyRead } from "../api/policies_api";

const PAGE_SIZE = 25;

/** "" (a placeholder "All" option) maps to `undefined` (no filter applied). */
function toBoolFilter(value: string): boolean | undefined {
    if (value === ALL_VALUE) return undefined;
    return value === "true";
}

/**
 * PoliciesPage
 * ----------------------------
 * Management CRUD for policies (backend: /authorization/policies). Route itself
 * is gated by ProtectedRoute permission="policies:read"; the create/edit/
 * delete affordances are additionally gated per-action here via IfCan,
 * since a caller might hold policies:read without policies:create/update/
 * delete. Search (name/description) and resource-type/status filter server-
 * side, and Name/Resource-type sort server-side (click the header) - same
 * pattern as UsersPage, once policy count could no longer be assumed small
 * enough to load and filter in full client-side.
 */
const PoliciesPage: React.FC = () => {
    const { t } = useTranslation(["policies", "ui_text"]);

    const [search, setSearch] = useState("");
    // Debounced, not the raw keystroke value: search is now a real request
    // (server-side), so typing shouldn't fire one request per character.
    const debouncedSearch = useDebouncedValue(search);
    // No default sort column: the table's natural order (insertion/id
    // order) isn't shown as its own column, so nothing should read as
    // "actively sorted" until a header is actually clicked.
    const { sort, toggleSort } = useSortState("");
    const [resourceType, setResourceType] = useState(ALL_VALUE);
    const [status, setStatus] = useState(ALL_VALUE);

    // A search/filter/sort change that changes the result set makes
    // whatever page you were on potentially meaningless - always back to
    // page 1 for a fresh query. See usePageResetOn's own docstring for why
    // this is state derived during render, not an effect.
    const [page, setPage] = usePageResetOn(`${debouncedSearch}|${sort.key}|${sort.direction}|${resourceType}|${status}`);

    const { data, isLoading, isError } = usePoliciesListQuery(page, PAGE_SIZE, {
        search: debouncedSearch,
        resourceType: resourceType || undefined,
        isActive: toBoolFilter(status),
        sortBy: sort.key || undefined,
        sortDir: sort.direction,
    });
    const filteredPolicies = data?.policies;
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    // PolicyStatsCard's summary counts are independent of the main list's
    // current page/filters (same reasoning as UserStatsCard), so it keeps
    // using the full, unfiltered list rather than this page's `data`.
    const { data: allPolicies, isLoading: isStatsLoading } = usePoliciesQuery();

    const [formOpen, setFormOpen] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState<PolicyRead | undefined>(undefined);
    const [deletingPolicy, setDeletingPolicy] = useState<PolicyRead | null>(null);
    const [viewingPolicy, setViewingPolicy] = useState<PolicyRead | null>(null);

    const createMutation = useCreatePolicyMutation();
    const updateMutation = useUpdatePolicyMutation();
    const deleteMutation = useDeletePolicyMutation();

    const openCreateForm = () => {
        setEditingPolicy(undefined);
        setFormOpen(true);
    };

    const openEditForm = (policy: PolicyRead) => {
        setEditingPolicy(policy);
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        createMutation.reset();
        updateMutation.reset();
    };

    const handleFormSubmit = (values: PolicyFormValues) => {
        if (editingPolicy) {
            updateMutation.mutate(
                { policyName: editingPolicy.name, payload: values },
                {
                    onSuccess: () => {
                        toaster.create({ title: t("policies:page.policyUpdatedToast"), type: "success" });
                        closeForm();
                    },
                }
            );
        } else {
            createMutation.mutate(values, {
                onSuccess: () => {
                    toaster.create({ title: t("policies:page.policyCreatedToast"), type: "success" });
                    closeForm();
                },
            });
        }
    };

    const handleDeleteConfirm = () => {
        if (!deletingPolicy) return;
        deleteMutation.mutate(
            { policyName: deletingPolicy.name },
            {
                onSuccess: () => {
                    toaster.create({ title: t("policies:page.policyDeletedToast"), type: "success" });
                    setDeletingPolicy(null);
                },
                onError: (error) => {
                    toaster.create({ title: error.message, type: "error" });
                },
            }
        );
    };

    const columns = buildPoliciesColumns({
        t,
        onView: setViewingPolicy,
        onEdit: openEditForm,
        onDeleteRequest: setDeletingPolicy,
    });

    const hasSearchOrFilters = !!search || resourceType !== ALL_VALUE || status !== ALL_VALUE;

    return (
        <PageContainer
            title={t("policies:page.title")}
            icon={ShieldCheck}
            description={t("policies:page.description")}
            actions={<PolicyStatsCard policies={allPolicies} isLoading={isStatsLoading} />}
            headerExtra={
                <PoliciesFilterBar
                    search={search}
                    setSearch={setSearch}
                    resourceType={resourceType}
                    setResourceType={setResourceType}
                    status={status}
                    setStatus={setStatus}
                    searchRowExtra={
                        <IfCan action={PERMISSIONS.POLICIES_CREATE}>
                            <Button colorPalette="brand" onClick={openCreateForm} {...BRAND_SOLID_HOVER_PROPS}>
                                {t("policies:page.createPolicy")}
                            </Button>
                        </IfCan>
                    }
                />
            }
        >
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mb={4} />

            <DataTable
                columns={columns}
                rows={filteredPolicies}
                rowKey={(p) => p.id}
                isLoading={isLoading}
                isError={isError}
                errorMessage={t("policies:page.failedToLoadPolicies")}
                emptyMessage={
                    search
                        ? t("policies:page.noPoliciesMatchSearch")
                        : resourceType !== ALL_VALUE || status !== ALL_VALUE
                          ? t("policies:page.noPoliciesMatchFilters")
                          : t("policies:page.noPoliciesYet")
                }
                emptyIcon={<ShieldOff size={32} aria-hidden="true" />}
                emptyAction={
                    !hasSearchOrFilters ? (
                        <IfCan action={PERMISSIONS.POLICIES_CREATE}>
                            <Button colorPalette="brand" onClick={openCreateForm} {...BRAND_SOLID_HOVER_PROPS}>
                                {t("policies:page.createPolicy")}
                            </Button>
                        </IfCan>
                    ) : undefined
                }
                sort={sort}
                onSortChange={toggleSort}
                startIndex={(page - 1) * PAGE_SIZE}
            />

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mt={4} />

            <PolicyDetailsDialog
                isOpen={!!viewingPolicy}
                policy={viewingPolicy}
                onClose={() => setViewingPolicy(null)}
            />

            <PolicyFormDialog
                isOpen={formOpen}
                policy={editingPolicy}
                isSaving={createMutation.isPending || updateMutation.isPending}
                errorMessage={createMutation.error?.message ?? updateMutation.error?.message ?? null}
                onSubmit={handleFormSubmit}
                onClose={closeForm}
            />

            <ConfirmDialog
                isOpen={!!deletingPolicy}
                title={t("policies:page.deleteDialogTitle")}
                description={t("policies:page.deleteDialogDescription", { policyName: deletingPolicy?.name })}
                confirmLabel={t("ui_text:delete")}
                isLoading={deleteMutation.isPending}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeletingPolicy(null)}
            />
        </PageContainer>
    );
};

export default PoliciesPage;
