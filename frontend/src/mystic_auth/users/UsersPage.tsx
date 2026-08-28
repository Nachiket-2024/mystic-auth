import React from "react";
import { Button } from "@chakra-ui/react";
import { Download, Users, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import PageContainer from "../ui/PageContainer";
import DataTable from "../ui/DataTable/DataTable";
import Pagination from "../ui/Pagination";
import { BRAND_SOLID_HOVER_PROPS } from "../ui/styles/buttonStyles";
import { IfCan } from "../authorization/IfCan";
import { PERMISSIONS } from "../authorization/permissions";
import UserStatsCard from "./UserStatsCard";
import UsersFilterBar, { ALL_VALUE } from "./UsersFilterBar";
import UsersPageDialogs from "./dialogs/UsersPageDialogs";
import BulkActionToolbar from "./bulk/BulkActionToolbar";
import BulkPolicyAssignDialog from "./bulk/BulkPolicyAssignDialog";
import BulkPermissionGrantDialog from "./bulk/BulkPermissionGrantDialog";
import BulkRoleAssignDialog from "./bulk/BulkRoleAssignDialog";
import { useUsersPageState } from "./useUsersPageState";

/**
 * UsersPage
 * ----------------------------
 * Management list of every user (backend: GET /users/), with per-row role
 * change, delete, and a "Policies" dialog for assigning/
 * revoking individual policy grants. Route is gated by
 * ProtectedRoute permission="users:list_all"; each destructive/privileged
 * action is additionally gated per-action via IfCan. Name/Email/Role sort
 * server-side (click the header), and Role/Verified/Status/Policy/Permission
 * filter server-side too - both narrow the whole result set, not just the
 * currently-loaded page, same as the audit_log/ section components (both
 * share ui/hooks/usePageResetOn.ts for the page-reset-on-filter-change logic).
 * The filter controls live in UsersFilterBar.tsx, every dialog this page can
 * open lives in UsersPageDialogs.tsx, and the query/mutation/handler wiring
 * lives in useUsersPageState.ts - this file just composes the three.
 */
const UsersPage: React.FC = () => {
    const { t } = useTranslation(["users", "ui_text"]);
    const {
        search,
        setSearch,
        role,
        setRole,
        verified,
        setVerified,
        status,
        setStatus,
        policy,
        setPolicy,
        permission,
        setPermission,
        sort,
        toggleSort,
        page,
        setPage,
        totalPages,
        users,
        isLoading,
        isError,
        columns,
        deletingUser,
        setDeletingUser,
        purgingUser,
        setPurgingUser,
        pendingRoleChange,
        setPendingRoleChange,
        policiesUser,
        setPoliciesUser,
        permissionsUser,
        setPermissionsUser,
        viewingUser,
        setViewingUser,
        selectedUserIds,
        setSelectedUserIds,
        selectedUserEmails,
        bulkDialog,
        setBulkDialog,
        rowClickSelects,
        setRowClickSelects,
        deleteMutation,
        purgeMutation,
        roleMutation,
        exportMutation,
        handleExport,
        handleRoleChangeConfirm,
        handleDeleteConfirm,
        handlePurgeConfirm,
        PAGE_SIZE,
    } = useUsersPageState();

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
                        setPolicy(ALL_VALUE);
                        setPermission(ALL_VALUE);
                    }}
                    onFilterVerified={() => {
                        setSearch("");
                        setVerified("true");
                        setRole(ALL_VALUE);
                        setStatus(ALL_VALUE);
                        setPolicy(ALL_VALUE);
                        setPermission(ALL_VALUE);
                    }}
                    onFilterUnverified={() => {
                        setSearch("");
                        setVerified("false");
                        setRole(ALL_VALUE);
                        setStatus(ALL_VALUE);
                        setPolicy(ALL_VALUE);
                        setPermission(ALL_VALUE);
                    }}
                    onFilterInactive={() => {
                        setSearch("");
                        setStatus("inactive");
                        setRole(ALL_VALUE);
                        setVerified(ALL_VALUE);
                        setPolicy(ALL_VALUE);
                        setPermission(ALL_VALUE);
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
                    policy={policy}
                    setPolicy={setPolicy}
                    permission={permission}
                    setPermission={setPermission}
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

            <BulkActionToolbar
                selectedCount={selectedUserIds.size}
                onBulkAssignPolicy={() => setBulkDialog("policy")}
                onBulkGrantPermission={() => setBulkDialog("permission")}
                onBulkSetRole={() => setBulkDialog("role")}
                onClearSelection={() => setSelectedUserIds(new Set())}
                rowClickSelects={rowClickSelects}
                onToggleRowClickSelects={() => setRowClickSelects((v) => !v)}
            />

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
                rowClickSelects={rowClickSelects}
                selectable
                selectedKeys={selectedUserIds}
                onSelectionChange={setSelectedUserIds}
            />

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mt={4} />

            <BulkPolicyAssignDialog
                isOpen={bulkDialog === "policy"}
                userEmails={selectedUserEmails}
                onClose={() => setBulkDialog(null)}
            />
            <BulkPermissionGrantDialog
                isOpen={bulkDialog === "permission"}
                userEmails={selectedUserEmails}
                onClose={() => setBulkDialog(null)}
            />
            <BulkRoleAssignDialog
                isOpen={bulkDialog === "role"}
                userEmails={selectedUserEmails}
                onClose={() => setBulkDialog(null)}
            />

            <UsersPageDialogs
                policiesUser={policiesUser}
                onClosePolicies={() => setPoliciesUser(null)}
                permissionsUser={permissionsUser}
                onClosePermissions={() => setPermissionsUser(null)}
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
