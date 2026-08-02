import React, { useState } from "react";
import { Badge, HStack, Input, Stack, Text } from "@chakra-ui/react";

import PageContainer from "../ui/PageContainer";
import DataTable, { type DataTableColumn } from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActionButton from "../ui/TableActionButton";
import Pagination from "../ui/Pagination";
import StyledSelect from "../ui/StyledSelect";
import { SEARCH_INPUT_PROPS } from "../ui/styles/inputStyles";
import { useDebouncedValue } from "../ui/hooks/useDebouncedValue";
import { useSortState } from "../ui/hooks/useSortState";
import { usePageResetOn } from "../ui/hooks/usePageResetOn";
import { IfCan } from "../authorization/IfCan";
import { PERMISSIONS } from "../authorization/permissions";
import { toaster } from "../ui/toaster/toasterInstance";
import { useAuthStore } from "../store/authStore";
import { useUsersQuery } from "./userQueries";
import UserStatsCard from "./UserStatsCard";
import {
    useDeleteUserMutation,
    usePurgeUserMutation,
    useReactivateUserMutation,
    useUpdateUserRoleMutation,
} from "./userMutations";
import type { AdminUserRead } from "../api/users_api";
import UserPoliciesDialog from "./UserPoliciesDialog";
import UserDetailsDialog from "./UserDetailsDialog";

const ROLE_OPTIONS = ["user", "admin", "system"] as const;
const PAGE_SIZE = 25;
const ALL_VALUE = "";

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "" (a placeholder "All" option) maps to `undefined` (no filter applied). */
function toBoolFilter(value: string): boolean | undefined {
    if (value === ALL_VALUE) return undefined;
    return value === "true";
}

/**
 * UsersPage
 * ----------------------------
 * Admin list of every user (backend: GET /users/), with per-row role
 * change, delete, and a "Policies" dialog for assigning/
 * revoking individual policy grants. Route is gated by
 * ProtectedRoute permission="users:list_all"; each destructive/privileged
 * action is additionally gated per-action via IfCan. Name/Email/Role sort
 * server-side (click the header), and Role/Verified/Status filter
 * server-side too - both narrow the whole result set, not just the
 * currently-loaded page, same as the audit_log/ section components (both
 * share ui/hooks/usePageResetOn.ts for the page-reset-on-filter-change logic).
 */
const UsersPage: React.FC = () => {
    const [search, setSearch] = useState("");
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

    const [deletingUser, setDeletingUser] = useState<AdminUserRead | null>(null);
    const [purgingUser, setPurgingUser] = useState<AdminUserRead | null>(null);
    const [pendingRoleChange, setPendingRoleChange] = useState<{ user: AdminUserRead; role: string } | null>(null);
    const [policiesUserEmail, setPoliciesUserEmail] = useState<string | null>(null);
    const [viewingUser, setViewingUser] = useState<AdminUserRead | null>(null);

    const deleteMutation = useDeleteUserMutation();
    const purgeMutation = usePurgeUserMutation();
    const reactivateMutation = useReactivateUserMutation();
    const roleMutation = useUpdateUserRoleMutation();

    const handleRoleChangeConfirm = () => {
        if (!pendingRoleChange) return;
        const { user, role } = pendingRoleChange;
        roleMutation.mutate(
            { userEmail: user.email, role },
            {
                onSuccess: () => {
                    toaster.create({ title: "Role updated", type: "success" });
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
                    toaster.create({ title: "User deleted : this is reversible via Reactivate", type: "success" });
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
                    toaster.create({ title: "User permanently removed", type: "success" });
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
                onSuccess: () => toaster.create({ title: "User reactivated", type: "success" }),
                onError: (error) => toaster.create({ title: error.message, type: "error" }),
            }
        );
    };

    const columns: DataTableColumn<AdminUserRead>[] = [
        {
            key: "name",
            header: "Name",
            sortable: true,
            width: "22%",
            truncate: true,
            render: (u) => (
                <Text fontWeight="medium">
                    {u.name}
                    {u.email === currentUserEmail && (
                        <Badge ml={2} colorPalette="brand" variant="subtle" size="md">
                            You
                        </Badge>
                    )}
                </Text>
            ),
        },
        { key: "email", header: "Email", sortable: true, width: "26%", truncate: true, render: (u) => u.email },
        {
            key: "role",
            header: "Role",
            sortable: true,
            width: "150px",
            render: (u) => (
                <IfCan
                    action={PERMISSIONS.USERS_ASSIGN_ROLE}
                    fallback={
                        <Text textTransform="capitalize" color={u.role ? undefined : "fg.muted"}>
                            {u.role ?? "No role assigned"}
                        </Text>
                    }
                >
                    <StyledSelect
                        w="130px"
                        value={u.role ?? ""}
                        onChange={(value) => setPendingRoleChange({ user: u, role: value })}
                        ariaLabel={`Change role for ${u.email}`}
                        textTransform="capitalize"
                        options={ROLE_OPTIONS.map((role) => ({ value: role, label: capitalize(role) }))}
                        disabled={u.email === currentUserEmail}
                        title={u.email === currentUserEmail ? "You cannot change your own role" : undefined}
                    />
                </IfCan>
            ),
        },
        {
            key: "status",
            header: "Status",
            width: "170px",
            render: (u) => (
                <HStack gap={1}>
                    <Badge colorPalette={u.is_verified ? "green" : "yellow"} size="md">
                        {u.is_verified ? "Verified" : "Unverified"}
                    </Badge>
                    {u.deleted_at ? (
                        <Badge colorPalette="red" size="md">Deleted</Badge>
                    ) : (
                        !u.is_active && <Badge colorPalette="red" size="md">Inactive</Badge>
                    )}
                </HStack>
            ),
        },
        {
            key: "row_actions",
            header: "",
            align: "end",
            // A deleted row shows up to 4 buttons at once (View + Policies +
            // Reactivate + Purge); 230px was only wide enough for ~2,
            // wrapping onto a second line. Wide enough for all four on one
            // line, on every row shape (1/2/3/4 buttons) this column ever
            // renders.
            width: "400px",
            render: (u) => (
                <HStack justify="flex-end" gap={2} wrap="wrap">
                    <TableActionButton onClick={() => setViewingUser(u)}>
                        View
                    </TableActionButton>
                    <IfCan action={PERMISSIONS.POLICIES_READ}>
                        <TableActionButton onClick={() => setPoliciesUserEmail(u.email)}>
                            Policies
                        </TableActionButton>
                    </IfCan>
                    {u.deleted_at ? (
                        <>
                            <IfCan action={PERMISSIONS.USERS_REACTIVATE}>
                                <TableActionButton
                                    colorPalette="green"
                                    onClick={() => handleReactivate(u.email)}
                                    loading={reactivateMutation.isPending && reactivateMutation.variables?.userEmail === u.email}
                                >
                                    Reactivate
                                </TableActionButton>
                            </IfCan>
                            <IfCan action={PERMISSIONS.USERS_PURGE}>
                                <TableActionButton
                                    colorPalette="red"
                                    onClick={() => setPurgingUser(u)}
                                    disabled={u.email === currentUserEmail}
                                >
                                    Purge
                                </TableActionButton>
                            </IfCan>
                        </>
                    ) : (
                        <IfCan action={PERMISSIONS.USERS_DELETE_ANY}>
                            <TableActionButton
                                colorPalette="red"
                                onClick={() => setDeletingUser(u)}
                                disabled={u.email === currentUserEmail}
                            >
                                Delete
                            </TableActionButton>
                        </IfCan>
                    )}
                </HStack>
            ),
        },
    ];

    return (
        <PageContainer
            title="Users"
            description="Manage user accounts, roles, and policy assignments."
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
                <Stack gap={3}>
                    <Input
                        placeholder="Search by name or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        maxW="sm"
                        {...SEARCH_INPUT_PROPS}
                    />

                    <HStack gap={3} wrap="wrap">
                        <StyledSelect
                            w="140px"
                            ariaLabel="Filter by role"
                            value={role}
                            onChange={setRole}
                            textTransform="capitalize"
                            options={[
                                { value: ALL_VALUE, label: "All roles" },
                                ...ROLE_OPTIONS.map((value) => ({ value, label: capitalize(value) })),
                            ]}
                        />

                        <StyledSelect
                            w="150px"
                            ariaLabel="Filter by verified status"
                            value={verified}
                            onChange={setVerified}
                            options={[
                                { value: ALL_VALUE, label: "All verification" },
                                { value: "true", label: "Verified" },
                                { value: "false", label: "Unverified" },
                            ]}
                        />

                        <StyledSelect
                            w="140px"
                            ariaLabel="Filter by status"
                            value={status}
                            onChange={setStatus}
                            options={[
                                { value: ALL_VALUE, label: "All statuses" },
                                { value: "active", label: "Active" },
                                { value: "inactive", label: "Inactive" },
                                { value: "deleted", label: "Deleted" },
                            ]}
                        />
                    </HStack>
                </Stack>
            }
        >
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mb={4} />

            <DataTable
                columns={columns}
                rows={users}
                rowKey={(u) => u.id}
                isLoading={isLoading}
                isError={isError}
                errorMessage="Failed to load users"
                emptyMessage={search ? "No users match your search" : "No users match these filters"}
                sort={sort}
                onSortChange={toggleSort}
                startIndex={(page - 1) * PAGE_SIZE}
            />

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mt={4} />

            <UserPoliciesDialog
                isOpen={!!policiesUserEmail}
                userEmail={policiesUserEmail}
                onClose={() => setPoliciesUserEmail(null)}
            />

            <UserDetailsDialog
                isOpen={!!viewingUser}
                user={viewingUser}
                onClose={() => setViewingUser(null)}
            />

            <ConfirmDialog
                isOpen={!!deletingUser}
                title="Delete user"
                description={`Delete "${deletingUser?.email}"? This deactivates their account and ends every active session : it's reversible via Reactivate.`}
                confirmLabel="Delete"
                isLoading={deleteMutation.isPending}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeletingUser(null)}
            />

            <ConfirmDialog
                isOpen={!!purgingUser}
                title="Permanently remove user"
                description={`Permanently remove "${purgingUser?.email}"? This cannot be undone : the account, its policy assignments, and its ability to ever be reactivated are all gone. (Authorization/security audit history is preserved separately.)`}
                confirmLabel="Permanently remove"
                isLoading={purgeMutation.isPending}
                onConfirm={handlePurgeConfirm}
                onCancel={() => setPurgingUser(null)}
            />

            <ConfirmDialog
                isOpen={!!pendingRoleChange}
                title="Change role"
                description={`Change ${pendingRoleChange?.user.email}'s role to "${pendingRoleChange ? capitalize(pendingRoleChange.role) : ""}"? Role is display/grouping metadata only : this does not itself change what they're permitted to do.`}
                confirmLabel="Change role"
                isDestructive={false}
                isLoading={roleMutation.isPending}
                onConfirm={handleRoleChangeConfirm}
                onCancel={() => setPendingRoleChange(null)}
            />
        </PageContainer>
    );
};

export default UsersPage;
