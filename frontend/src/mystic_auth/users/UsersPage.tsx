import React, { useState } from "react";
import { Button } from "@chakra-ui/react";
import { Download, Users, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import PageContainer from "../ui/PageContainer";
import DataTable from "../ui/DataTable/DataTable";
import Pagination from "../ui/Pagination";
import { BRAND_SOLID_HOVER_PROPS } from "../ui/styles/buttonStyles";
import { IfCan } from "../authorization/IfCan";
import { PERMISSIONS } from "../authorization/permissions";
import { useDebouncedValue } from "../ui/hooks/useDebouncedValue";
import { useSortState } from "../ui/hooks/useSortState";
import { usePageResetOn } from "../ui/hooks/usePageResetOn";
import { toaster } from "../ui/toaster/toasterInstance";
import { useAuthStore } from "../store/authStore";
import { useUsersQuery } from "./userQueries";
import UserStatsCard from "./UserStatsCard";
import {
    useDeleteUserMutation,
    usePurgeUserMutation,
    useReactivateUserMutation,
    useUpdateUserRoleMutation,
    useExportUsersMutation,
} from "./userMutations";
import type { ManagedUserRead } from "../api/users_api";
import UsersFilterBar, { ALL_VALUE } from "./UsersFilterBar";
import UsersPageDialogs from "./UsersPageDialogs";
import { buildUsersColumns } from "./usersColumns";

const PAGE_SIZE = 25;

/** "" (a placeholder "All" option) maps to `undefined` (no filter applied). */
function toBoolFilter(value: string): boolean | undefined {
    if (value === ALL_VALUE) return undefined;
    return value === "true";
}

/**
 * UsersPage
 * ----------------------------
 * Management list of every user (backend: GET /users/), with per-row role
 * change, delete, and a "Policies" dialog for assigning/
 * revoking individual policy grants. Route is gated by
 * ProtectedRoute permission="users:list_all"; each destructive/privileged
 * action is additionally gated per-action via IfCan. Name/Email/Role sort
 * server-side (click the header), and Role/Verified/Status filter
 * server-side too - both narrow the whole result set, not just the
 * currently-loaded page, same as the audit_log/ section components (both
 * share ui/hooks/usePageResetOn.ts for the page-reset-on-filter-change logic).
 * The filter controls live in UsersFilterBar.tsx and every dialog this page
 * can open lives in UsersPageDialogs.tsx - this file owns the query/mutation
 * wiring and composes those two.
 */
const UsersPage: React.FC = () => {
    const { t } = useTranslation(["users", "ui_text"]);
    // Read-once initializer, not a synced-both-ways URL param: this only
    // needs to support deep-linking in from elsewhere (CommandPalette's
    // user results navigate to /users?search=<email>), not reflect every
    // subsequent keystroke back into the URL.
    const [searchParams] = useSearchParams();
    const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
    // Debounced, not the raw keystroke value: search is now a real request
    // (server-side, since the table itself is paginated and no longer holds
    // every user to filter client-side), so typing shouldn't fire one
    // request per character.
    const debouncedSearch = useDebouncedValue(search);

    // No default sort column: the table's natural order (insertion/id order)
    // isn't shown as its own column, so nothing should read as "actively
    // sorted" until a header is actually clicked.
    const { sort, toggleSort } = useSortState("");
    const [role, setRole] = useState(ALL_VALUE);
    const [verified, setVerified] = useState(ALL_VALUE);
    const [status, setStatus] = useState(ALL_VALUE);

    // A search/filter/sort change that changes the result set makes whatever
    // page you were on potentially meaningless (e.g. page 3 of an unfiltered
    // list may not exist at all once filtered) - always back to page 1 for a
    // fresh query. See usePageResetOn's own docstring for why this is state
    // derived during render, not an effect.
    const [page, setPage] = usePageResetOn(`${debouncedSearch}|${sort.key}|${sort.direction}|${role}|${verified}|${status}`);

    const { data, isLoading, isError } = useUsersQuery(page, PAGE_SIZE, {
        search: debouncedSearch,
        role: role || undefined,
        isVerified: toBoolFilter(verified),
        status: status || undefined,
        sortBy: sort.key || undefined,
        sortDir: sort.direction,
    });
    const users = data?.users;
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
    const currentUserEmail = useAuthStore((s) => s.email);

    const [deletingUser, setDeletingUser] = useState<ManagedUserRead | null>(null);
    const [purgingUser, setPurgingUser] = useState<ManagedUserRead | null>(null);
    const [pendingRoleChange, setPendingRoleChange] = useState<{ user: ManagedUserRead; role: string } | null>(null);
    const [policiesUserEmail, setPoliciesUserEmail] = useState<string | null>(null);
    const [viewingUser, setViewingUser] = useState<ManagedUserRead | null>(null);

    const deleteMutation = useDeleteUserMutation();
    const purgeMutation = usePurgeUserMutation();
    const reactivateMutation = useReactivateUserMutation();
    const roleMutation = useUpdateUserRoleMutation();
    const exportMutation = useExportUsersMutation();

    const handleExport = () => {
        exportMutation.mutate(
            {
                search: debouncedSearch,
                role: role || undefined,
                isVerified: toBoolFilter(verified),
                status: status || undefined,
            },
            { onError: (error) => toaster.create({ title: error.message, type: "error" }) }
        );
    };

    const handleRoleChangeConfirm = () => {
        if (!pendingRoleChange) return;
        const { user, role } = pendingRoleChange;
        roleMutation.mutate(
            { userEmail: user.email, role },
            {
                onSuccess: () => {
                    toaster.create({ title: t("users:page.roleUpdatedToast"), type: "success" });
                    setPendingRoleChange(null);
                },
                onError: (error) => toaster.create({ title: error.message, type: "error" }),
            }
        );
    };

    const handleDeleteConfirm = () => {
        if (!deletingUser) return;
        deleteMutation.mutate(
            { userEmail: deletingUser.email },
            {
                onSuccess: () => {
                    toaster.create({ title: t("users:page.userDeletedToast"), type: "success" });
                    setDeletingUser(null);
                },
                onError: (error) => toaster.create({ title: error.message, type: "error" }),
            }
        );
    };

    const handlePurgeConfirm = () => {
        if (!purgingUser) return;
        purgeMutation.mutate(
            { userEmail: purgingUser.email },
            {
                onSuccess: () => {
                    toaster.create({ title: t("users:page.userPurgedToast"), type: "success" });
                    setPurgingUser(null);
                },
                onError: (error) => toaster.create({ title: error.message, type: "error" }),
            }
        );
    };

    const handleReactivate = (userEmail: string) => {
        reactivateMutation.mutate(
            { userEmail },
            {
                onSuccess: () => toaster.create({ title: t("users:page.userReactivatedToast"), type: "success" }),
                onError: (error) => toaster.create({ title: error.message, type: "error" }),
            }
        );
    };

    const columns = buildUsersColumns({
        t,
        currentUserEmail,
        onRoleChangeRequest: (user, role) => setPendingRoleChange({ user, role }),
        onView: setViewingUser,
        onPolicies: setPoliciesUserEmail,
        onReactivate: handleReactivate,
        reactivatingEmail: reactivateMutation.isPending ? reactivateMutation.variables?.userEmail : undefined,
        onPurgeRequest: setPurgingUser,
        onDeleteRequest: setDeletingUser,
    });

    return (
        <PageContainer
            title={t("users:page.title")}
            icon={Users}
            description={t("users:page.description")}
            actions={
                <UserStatsCard
                    onFilterTotal={() => {
                        setSearch("");
                        setRole(ALL_VALUE);
                        setVerified(ALL_VALUE);
                        setStatus(ALL_VALUE);
                    }}
                    onFilterVerified={() => {
                        setSearch("");
                        setVerified("true");
                        setRole(ALL_VALUE);
                        setStatus(ALL_VALUE);
                    }}
                    onFilterUnverified={() => {
                        setSearch("");
                        setVerified("false");
                        setRole(ALL_VALUE);
                        setStatus(ALL_VALUE);
                    }}
                    onFilterInactive={() => {
                        setSearch("");
                        setStatus("inactive");
                        setRole(ALL_VALUE);
                        setVerified(ALL_VALUE);
                    }}
                />
            }
            headerExtra={
                <UsersFilterBar
                    search={search}
                    setSearch={setSearch}
                    role={role}
                    setRole={setRole}
                    verified={verified}
                    setVerified={setVerified}
                    status={status}
                    setStatus={setStatus}
                    searchRowExtra={
                        <IfCan action={PERMISSIONS.USERS_LIST_ALL}>
                            <Button
                                size="sm"
                                colorPalette="brand"
                                onClick={handleExport}
                                loading={exportMutation.isPending}
                                {...BRAND_SOLID_HOVER_PROPS}
                            >
                                <Download size={16} />
                                {t("users:page.exportCsv")}
                            </Button>
                        </IfCan>
                    }
                />
            }
        >
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mb={4} />

            <DataTable
                columns={columns}
                rows={users}
                rowKey={(u) => u.id}
                isLoading={isLoading}
                isError={isError}
                errorMessage={t("users:page.failedToLoadUsers")}
                emptyMessage={search ? t("users:page.noUsersMatchSearch") : t("users:page.noUsersMatchFilters")}
                emptyIcon={<UsersRound size={32} aria-hidden="true" />}
                sort={sort}
                onSortChange={toggleSort}
                startIndex={(page - 1) * PAGE_SIZE}
            />

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mt={4} />

            <UsersPageDialogs
                policiesUserEmail={policiesUserEmail}
                onClosePolicies={() => setPoliciesUserEmail(null)}
                viewingUser={viewingUser}
                onCloseView={() => setViewingUser(null)}
                deletingUser={deletingUser}
                isDeletePending={deleteMutation.isPending}
                onConfirmDelete={handleDeleteConfirm}
                onCancelDelete={() => setDeletingUser(null)}
                purgingUser={purgingUser}
                isPurgePending={purgeMutation.isPending}
                onConfirmPurge={handlePurgeConfirm}
                onCancelPurge={() => setPurgingUser(null)}
                pendingRoleChange={pendingRoleChange}
                isRoleChangePending={roleMutation.isPending}
                onConfirmRoleChange={handleRoleChangeConfirm}
                onCancelRoleChange={() => setPendingRoleChange(null)}
            />
        </PageContainer>
    );
};

export default UsersPage;
