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

/** Maps the "All" placeholder option to `undefined` (no filter applied). */
function toBoolFilter(value: string): boolean | undefined {
    if (value === ALL_VALUE) return undefined;
    return value === "true";
}

/** Filter/sort/pagination/selection state and handlers for UsersPage, split
 * out so that file stays composition and JSX. */
export function useUsersPageState() {
    const { t } = useTranslation(["users", "ui_text"]);
    // Read once, not synced back to the URL: only needed for deep links in
    // (CommandPalette navigates to /users?search=<email>).
    const [searchParams] = useSearchParams();
    const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
    // Debounced since search now hits the server (the table is paginated,
    // not filtered client-side), so typing shouldn't fire one request per key.
    const debouncedSearch = useDebouncedValue(search);

    // No default sort column: nothing should read as "actively sorted"
    // until a header is actually clicked.
    const { sort, toggleSort } = useSortState("");
    const [role, setRole] = useState(ALL_VALUE);
    const [verified, setVerified] = useState(ALL_VALUE);
    const [status, setStatus] = useState(ALL_VALUE);
    const [policy, setPolicy] = useState(ALL_VALUE);
    const [permission, setPermission] = useState(ALL_VALUE);

    // A filter/sort change can make the current page number meaningless
    // (page 3 might not exist once filtered), so it resets to page 1. Also
    // reused below (with `page`) to key the selection reset, since a filter
    // change on page 1 wouldn't otherwise be detected.
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
    // Stores the full row, not just the email: the dialogs need the role too,
    // to disable assign/revoke against the system account (same as usersColumns.tsx).
    // The backend rejects it anyway, but the dialog shouldn't offer a control
    // that can only ever fail.
    const [policiesUser, setPoliciesUser] = useState<ManagedUserRead | null>(null);
    const [permissionsUser, setPermissionsUser] = useState<ManagedUserRead | null>(null);
    const [viewingUser, setViewingUser] = useState<ManagedUserRead | null>(null);

    // Bulk multi-select, keyed by user id. Reset whenever the page or filters
    // change so a stale selection can't silently span rows no longer on screen.
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string | number>>(new Set());
    const [bulkDialog, setBulkDialog] = useState<"policy" | "permission" | "role" | null>(null);
    // Off by default: clicking a row only selects it once the admin turns
    // this on, so normal text selection/copy still works otherwise.
    const [rowClickSelects, setRowClickSelects] = useState(false);

    // Clears selection on any page or filter change, so a bulk action can't
    // apply to users no longer on screen. Derived during render (not an
    // effect) to avoid an extra render.
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
