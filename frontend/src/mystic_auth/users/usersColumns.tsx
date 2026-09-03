import { HStack, Text } from "@chakra-ui/react";
import { Eye, Key, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";

import Badge from "../ui/Badge";
import type { DataTableColumn } from "../ui/DataTable/DataTable";
import TableActionIconButton from "../ui/table_actions/TableActionIconButton";
import StyledSelect from "../ui/StyledSelect";
import { IfCan } from "../authorization/IfCan";
import { PERMISSIONS } from "../authorization/permissions";
import type { ManagedUserRead } from "../api/users_api";

export const ROLE_OPTIONS = ["user", "admin", "system"] as const;

export function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

interface BuildUsersColumnsParams {
    t: TFunction<["users", "ui_text"]>;
    currentUserEmail: string | null | undefined;
    onRoleChangeRequest: (user: ManagedUserRead, role: string) => void;
    onView: (user: ManagedUserRead) => void;
    onPolicies: (user: ManagedUserRead) => void;
    onPermissions: (user: ManagedUserRead) => void;
    onReactivate: (email: string) => void;
    reactivatingEmail: string | undefined;
    onPurgeRequest: (user: ManagedUserRead) => void;
    onDeleteRequest: (user: ManagedUserRead) => void;
}

/** UsersPage's DataTable column definitions, built from a params object
 * (not a plain array) since they need page state/handlers to render
 * per-row actions. */
export function buildUsersColumns({
    t,
    currentUserEmail,
    onRoleChangeRequest,
    onView,
    onPolicies,
    onPermissions,
    onReactivate,
    reactivatingEmail,
    onPurgeRequest,
    onDeleteRequest,
}: BuildUsersColumnsParams): DataTableColumn<ManagedUserRead>[] {
    return [
        {
            key: "name",
            header: t("users:columns.name"),
            sortable: true,
            // Fixed rem width, not a percentage: mixing units squeezed
            // Name/Email illegibly small on narrow viewports instead of
            // triggering the table's horizontal scroll. All-rem widths
            // keep the total width deterministic.
            width: "12rem",
            truncate: true,
            render: (u) => (
                <Text fontWeight="medium">
                    {u.name}
                    {u.email === currentUserEmail && (
                        <Badge ml={2} colorPalette="brand" variant="subtle" size="md">
                            {t("users:columns.you")}
                        </Badge>
                    )}
                </Text>
            ),
        },
        { key: "email", header: t("users:columns.email"), sortable: true, width: "16rem", truncate: true, render: (u) => u.email },
        {
            key: "role",
            header: t("users:columns.role"),
            sortable: true,
            width: "9.375rem",
            render: (u) => (
                <IfCan
                    action={PERMISSIONS.USERS_ASSIGN_ROLE}
                    fallback={
                        <Text textTransform="capitalize" color={u.role ? undefined : "fg.muted"}>
                            {u.role ?? t("users:columns.noRoleAssigned")}
                        </Text>
                    }
                >
                    <StyledSelect
                        w="32"
                        value={u.role ?? ""}
                        onChange={(value) => onRoleChangeRequest(u, value)}
                        ariaLabel={t("users:columns.changeRoleAriaLabel", { email: u.email })}
                        textTransform="capitalize"
                        options={ROLE_OPTIONS.map((role) => ({ value: role, label: capitalize(role) }))}
                        disabled={u.email === currentUserEmail || u.role === "system"}
                        title={
                            u.email === currentUserEmail
                                ? t("users:columns.cannotChangeOwnRole")
                                : u.role === "system"
                                  ? t("users:columns.cannotModifySystemUser")
                                  : undefined
                        }
                    />
                </IfCan>
            ),
        },
        {
            key: "status",
            header: t("users:columns.status"),
            width: "10.625rem",
            render: (u) => (
                <HStack gap={1}>
                    <Badge colorPalette={u.is_verified ? "green" : "yellow"} size="md">
                        {u.is_verified ? t("users:columns.verified") : t("users:columns.unverified")}
                    </Badge>
                    {u.deleted_at ? (
                        <Badge colorPalette="red" size="md">{t("users:columns.deleted")}</Badge>
                    ) : (
                        !u.is_active && <Badge colorPalette="red" size="md">{t("ui_text:inactive")}</Badge>
                    )}
                </HStack>
            ),
        },
        {
            key: "row_actions",
            header: "",
            align: "end",
            // Icon-only buttons, not text pills: some translated labels run
            // 4-5x wider than English, and icons keep every row's actions
            // on one line regardless of locale.
            width: "11rem",
            render: (u) => (
                <HStack justify="flex-end" gap={1.5} wrap="nowrap">
                    <TableActionIconButton colorPalette="blue" label={t("users:columns.view")} onClick={() => onView(u)}>
                        <Eye size={16} aria-hidden="true" />
                    </TableActionIconButton>
                    <IfCan action={PERMISSIONS.POLICIES_READ}>
                        <TableActionIconButton
                            colorPalette="purple"
                            label={t("users:columns.policies")}
                            onClick={() => onPolicies(u)}
                        >
                            <ShieldCheck size={16} aria-hidden="true" />
                        </TableActionIconButton>
                    </IfCan>
                    <IfCan action={PERMISSIONS.PERMISSIONS_READ}>
                        <TableActionIconButton
                            colorPalette="orange"
                            label={t("users:columns.permissions")}
                            onClick={() => onPermissions(u)}
                        >
                            <Key size={16} aria-hidden="true" />
                        </TableActionIconButton>
                    </IfCan>
                    {u.deleted_at ? (
                        <>
                            <IfCan action={PERMISSIONS.USERS_REACTIVATE}>
                                <TableActionIconButton
                                    colorPalette="green"
                                    label={t("users:columns.reactivate")}
                                    onClick={() => onReactivate(u.email)}
                                    loading={reactivatingEmail === u.email}
                                >
                                    <RotateCcw size={16} aria-hidden="true" />
                                </TableActionIconButton>
                            </IfCan>
                            <IfCan action={PERMISSIONS.USERS_PURGE}>
                                <TableActionIconButton
                                    colorPalette="red"
                                    label={t("users:columns.purge")}
                                    disabledLabel={
                                        u.email === currentUserEmail
                                            ? t("users:columns.cannotPurgeOwnAccount")
                                            : t("users:columns.cannotModifySystemUser")
                                    }
                                    onClick={() => onPurgeRequest(u)}
                                    disabled={u.email === currentUserEmail || u.role === "system"}
                                >
                                    <Trash2 size={16} aria-hidden="true" />
                                </TableActionIconButton>
                            </IfCan>
                        </>
                    ) : (
                        <IfCan action={PERMISSIONS.USERS_DELETE_ANY}>
                            <TableActionIconButton
                                colorPalette="red"
                                label={t("ui_text:delete")}
                                disabledLabel={
                                    u.email === currentUserEmail
                                        ? t("users:columns.cannotDeleteOwnAccount")
                                        : t("users:columns.cannotModifySystemUser")
                                }
                                onClick={() => onDeleteRequest(u)}
                                disabled={u.email === currentUserEmail || u.role === "system"}
                            >
                                <Trash2 size={16} aria-hidden="true" />
                            </TableActionIconButton>
                        </IfCan>
                    )}
                </HStack>
            ),
        },
    ];
}
