import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { useDebouncedValue } from "../ui/hooks/useDebouncedValue";
import { useSortState } from "../ui/hooks/useSortState";
import { usePageResetOn } from "../ui/hooks/usePageResetOn";
import { toaster } from "../ui/toaster/toasterInstance";
import { useAuthStore } from "../store/authStore";
import { useUsersQuery } from "./queries/userQueries";
import {
    useDeleteUserMutation,
    usePurgeUserMutation,
    useReactivateUserMutation,
    useUpdateUserRoleMutation,
    useExportUsersMutation,
} from "./queries/userMutations";
import type { ManagedUserRead } from "../api/users_api";
import { ALL_VALUE } from "./UsersFilterBar";
import { buildUsersColumns } from "./usersColumns";

const PAGE_SIZE = 25;

/** "" (a placeholder "All" option) maps to `undefined` (no filter applied). */
function toBoolFilter(value: string): boolean | undefined {
    if (value === ALL_VALUE) return undefined;
    return value === "true";
}

/**
 * useUsersPageState
 * ----------------------------
 * Filter/sort/pagination/selection state, the query/mutation wiring, and
 * every handler UsersPage needs, split out so that file stays composition +
 * JSX. See UsersPage's own docstring for what this page is for.
 */
export function useUsersPageState() {
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
    const [policy, setPolicy] = useState(ALL_VALUE);
    const [permission, setPermission] = useState(ALL_VALUE);

    // A search/filter/sort change that changes the result set makes whatever
    // page you were on potentially meaningless (e.g. page 3 of an unfiltered
    // list may not exist at all once filtered) - always back to page 1 for a
    // fresh query. See usePageResetOn's own docstring for why this is state
    // derived during render, not an effect. Also reused below (combined with
    // `page`) to key the selection reset: a filter change while already on
    // page 1 is a no-op for setPage(1) but still swaps out the visible rows,
    // so the selection reset must key off the filters too, not page alone.
    const filterResetKey = `${debouncedSearch}|${sort.key}|${sort.direction}|${role}|${verified}|${status}|${policy}|${permission}`;
    const [page, setPage] = usePageResetOn(filterResetKey);

    const { data, isLoading, isError } = useUsersQuery(page, PAGE_SIZE, {
        search: debouncedSearch,
        role: role || undefined,
        isVerified: toBoolFilter(verified),
        status: status || undefined,
        policy: policy || undefined,
        permission: permission || undefined,
        sortBy: sort.key || undefined,
        sortDir: sort.direction,
    });
    const users = data?.users;
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
    const currentUserEmail = useAuthStore((s) => s.email);

    const [deletingUser, setDeletingUser] = useState<ManagedUserRead | null>(null);
    const [purgingUser, setPurgingUser] = useState<ManagedUserRead | null>(null);
    const [pendingRoleChange, setPendingRoleChange] = useState<{ user: ManagedUserRead; role: string } | null>(null);
    // The full row, not just the email: UserPoliciesDialog/UserPermissionsDialog
    // need the target's role too, to disable assign/revoke against the
    // reserved system account the same way the row actions already do (see
    // usersColumns.tsx) - the backend rejects those mutations either way
    // (SYSTEM_USER_CANNOT_BE_MODIFIED), but the dialogs shouldn't offer a
    // control that can only ever 403.
    const [policiesUser, setPoliciesUser] = useState<ManagedUserRead | null>(null);
    const [permissionsUser, setPermissionsUser] = useState<ManagedUserRead | null>(null);
    const [viewingUser, setViewingUser] = useState<ManagedUserRead | null>(null);

    // Bulk multi-select: DataTable already supports selectable/selectedKeys/
    // onSelectionChange (ui/DataTable/DataTable.tsx), just unused until now.
    // Keyed by user id (same key space as rowKey below), reset whenever the
    // page/filters change so a stale selection can't silently span rows
    // that are no longer even on screen.
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string | number>>(new Set());
    const [bulkDialog, setBulkDialog] = useState<"policy" | "permission" | "role" | null>(null);
    // Off by default (see BulkActionToolbar/DataTable's own doc): clicking
    // a row only selects it once the admin explicitly turns this on, so
    // normal text selection/copy (an email address, a name) keeps working
    // the rest of the time.
    const [rowClickSelects, setRowClickSelects] = useState(false);

    // Clears selection on any page or filter change, so a bulk action can't
    // silently apply to users no longer on screen. Keyed on page+filterResetKey
    // together, not `page` alone: a filter change while already on page 1
    // leaves `page` unchanged, which a page-only comparison would miss.
    // Derived during render, not an effect, to avoid an extra render.
    const selectionResetKey = `${page}|${filterResetKey}`;
    const [prevSelectionKey, setPrevSelectionKey] = useState(selectionResetKey);
    if (selectionResetKey !== prevSelectionKey) {
        setPrevSelectionKey(selectionResetKey);
        setSelectedUserIds(new Set());
    }

    const selectedUserEmails = (users ?? []).filter((u) => selectedUserIds.has(u.id)).map((u) => u.email);

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
                policy: policy || undefined,
                permission: permission || undefined,
            },
            { onError: (error) => toaster.create({ title: error.message, type: "error" }) }
        );
    };

    const handleRoleChangeConfirm = () => {
        if (!pendingRoleChange) return;
        const { user, role: newRole } = pendingRoleChange;
        roleMutation.mutate(
            { userEmail: user.email, role: newRole },
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
        onRoleChangeRequest: (user, newRole) => setPendingRoleChange({ user, role: newRole }),
        onView: setViewingUser,
        onPolicies: setPoliciesUser,
        onPermissions: setPermissionsUser,
        onReactivate: handleReactivate,
        reactivatingEmail: reactivateMutation.isPending ? reactivateMutation.variables?.userEmail : undefined,
        onPurgeRequest: setPurgingUser,
        onDeleteRequest: setDeletingUser,
    });

    return {
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
    };
}
