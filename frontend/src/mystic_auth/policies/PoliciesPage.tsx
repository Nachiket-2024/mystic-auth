import React, { useState } from "react";
import { Button } from "@chakra-ui/react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import PageContainer from "../ui/PageContainer";
import DataTable from "../ui/DataTable/DataTable";
import Pagination from "../ui/Pagination";
import ConfirmDialog from "../ui/ConfirmDialog";
import FormAlert from "../ui/FormAlert";
import { BRAND_SOLID_HOVER_PROPS } from "../ui/styles/buttonStyles";
import { IfCan } from "../authorization/IfCan";
import { useCan } from "../authorization/useCan";
import { PERMISSIONS } from "../authorization/permissions";
import { useDebouncedValue } from "../ui/hooks/useDebouncedValue";
import { useSortState } from "../ui/hooks/useSortState";
import { usePageResetOn } from "../ui/hooks/usePageResetOn";
import { toaster } from "../ui/toaster/toasterInstance";
import { usePoliciesQuery, usePoliciesListQuery } from "./queries/policyQueries";
import { useCreatePolicyMutation, useUpdatePolicyMutation, useDeletePolicyMutation } from "./queries/policyMutations";
import PolicyFormDialog, { type PolicyFormValues } from "./dialogs/PolicyFormDialog";
import PolicyDetailsDialog from "./dialogs/PolicyDetailsDialog";
import PolicyStatsCard from "./PolicyStatsCard";
import PoliciesFilterBar, { ALL_VALUE } from "./PoliciesFilterBar";
import { buildPoliciesColumns } from "./policiesColumns";
import type { PolicyRead } from "../api/policies_api";

const PAGE_SIZE = 25;

/** Maps the placeholder "All" option ("") to `undefined` (no filter). */
function toBoolFilter(value: string): boolean | undefined {
    if (value === ALL_VALUE) return undefined;
    return value === "true";
}

/**
 * PoliciesPage
 * ----------------------------
 * Management CRUD for policies (backend: /authorization/policies). The
 * route is gated by ProtectedRoute on policies:read or policies:create;
 * create/edit/delete are further gated per-action via IfCan since a caller
 * might have read without create/update/delete. Search and resource-type/
 * status filters, plus Name/Resource-type sort, all run server-side (same
 * as UsersPage) since the policy list can no longer be assumed small enough
 * to filter client-side.
 *
 * A caller with only policies:create (not policies:read) can't list, search,
 * or filter policies, since GET /authorization/policies requires read. For
 * them the list/stats queries never fire (see canReadPolicies below) and the
 * page shows a restricted-view notice plus a standalone Create Policy
 * button instead of a DataTable stuck in an error state.
 */
const PoliciesPage: React.FC = () => {
    const { t } = useTranslation(["policies", "ui_text"]);

    const canReadPolicies = useCan(PERMISSIONS.POLICIES_READ);

    const [search, setSearch] = useState("");
    // Debounced since search is now a server request, not a client filter -
    // typing shouldn't fire one request per keystroke.
    const debouncedSearch = useDebouncedValue(search);
    // No default sort column: nothing should read as "actively sorted"
    // until a header is actually clicked.
    const { sort, toggleSort } = useSortState("");
    const [resourceType, setResourceType] = useState(ALL_VALUE);
    const [status, setStatus] = useState(ALL_VALUE);

    // Any search/filter/sort change can make the current page meaningless,
    // so always reset to page 1. See usePageResetOn's docstring for why
    // this is derived during render rather than in an effect.
    const [page, setPage] = usePageResetOn(`${debouncedSearch}|${sort.key}|${sort.direction}|${resourceType}|${status}`);

    const { data, isLoading, isError } = usePoliciesListQuery(
        page,
        PAGE_SIZE,
        {
            search: debouncedSearch,
            resourceType: resourceType || undefined,
            isActive: toBoolFilter(status),
            sortBy: sort.key || undefined,
            sortDir: sort.direction,
        },
        canReadPolicies
    );
    const filteredPolicies = data?.policies;
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

    // PolicyStatsCard's counts should stay independent of the current page/
    // filters, so it uses the full unfiltered list, not this page's `data`.
    const { data: allPolicies, isLoading: isStatsLoading } = usePoliciesQuery(canReadPolicies);

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
            actions={canReadPolicies ? <PolicyStatsCard policies={allPolicies} isLoading={isStatsLoading} /> : undefined}
            headerExtra={
                canReadPolicies ? (
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
                ) : (
                    // No policies:read means no list query to drive a filter
                    // bar, so just a standalone Create Policy button.
                    <IfCan action={PERMISSIONS.POLICIES_CREATE}>
                        <Button colorPalette="brand" onClick={openCreateForm} {...BRAND_SOLID_HOVER_PROPS}>
                            {t("policies:page.createPolicy")}
                        </Button>
                    </IfCan>
                )
            }
        >
            {!canReadPolicies ? (
                <FormAlert status="warning">{t("policies:page.cannotViewExistingPolicies")}</FormAlert>
            ) : (
                <>
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
                </>
            )}

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
