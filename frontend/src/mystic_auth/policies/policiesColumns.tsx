import { HStack, Text, Wrap } from "@chakra-ui/react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";

import Badge from "../ui/Badge";
import type { DataTableColumn } from "../ui/DataTable/DataTable";
import TableActionIconButton from "../ui/table_actions/TableActionIconButton";
import { IfCan } from "../authorization/IfCan";
import { PERMISSIONS } from "../authorization/permissions";
import type { PolicyRead } from "../api/policies_api";

interface BuildPoliciesColumnsParams {
    t: TFunction<["policies", "ui_text"]>;
    onView: (policy: PolicyRead) => void;
    onEdit: (policy: PolicyRead) => void;
    onDeleteRequest: (policy: PolicyRead) => void;
}

/** Same "columns as a function of page state" shape as
 * rateLimitsColumns.tsx's buildRateLimitsColumns: row actions need the
 * page's own dialog-open callbacks. Split out of PoliciesPage.tsx to keep
 * that file under the project's line-count budget. */
export function buildPoliciesColumns({
    t,
    onView,
    onEdit,
    onDeleteRequest,
}: BuildPoliciesColumnsParams): DataTableColumn<PolicyRead>[] {
    return [
        {
            key: "name",
            header: t("policies:columns.name"),
            sortable: true,
            // Narrowed from 13.75rem to fit the View button in row_actions
            // below without widening the table, same 12rem usersColumns.tsx
            // uses for its Name column.
            width: "12rem",
            truncate: true,
            render: (p) => (
                <Text fontWeight="medium">
                    {p.name}
                    {!p.is_active && (
                        <Badge ml={2} colorPalette="gray" size="md">
                            {t("ui_text:inactive")}
                        </Badge>
                    )}
                </Text>
            ),
        },
        {
            key: "resource_type",
            header: t("policies:columns.resourceType"),
            sortable: true,
            width: "9.375rem",
            truncate: true,
            render: (p) => p.resource_type,
        },
        {
            key: "actions_list",
            header: t("policies:columns.actions"),
            // Explicit width, not left unset: table-layout:fixed only gives an
            // unset column "whatever's left" when every other column is also
            // unset/percentage. Mixed with this table's rem-sized columns, an
            // unset column here collapsed to illegible px (same fix as
            // usersColumns.tsx's Name/Email columns). Badges wrap, so a fixed
            // width just means more rows, not lost content.
            width: "20rem",
            render: (p) => (
                <Wrap gap={1}>
                    {p.actions.map((a) => (
                        <Badge key={a} colorPalette="brand" variant="subtle" fontSize="md" px={2} py={0.5}>
                            {a}
                        </Badge>
                    ))}
                </Wrap>
            ),
        },
        {
            key: "row_actions",
            header: "",
            align: "end",
            // Icon-only buttons (tooltip + aria-label carry the text), same
            // as usersColumns.tsx's row_actions: a fixed-width text column
            // can't fit every locale's translation (Hindi/Marathi run
            // longer than English), so icons are the only way to keep this
            // on one line in every language.
            width: "8rem",
            render: (p) => (
                <HStack justify="flex-end" gap={1.5} wrap="nowrap">
                    <TableActionIconButton colorPalette="blue" label={t("policies:columns.view")} onClick={() => onView(p)}>
                        <Eye size={16} aria-hidden="true" />
                    </TableActionIconButton>
                    <IfCan action={PERMISSIONS.POLICIES_UPDATE}>
                        <TableActionIconButton colorPalette="orange" label={t("policies:columns.edit")} onClick={() => onEdit(p)}>
                            <Pencil size={16} aria-hidden="true" />
                        </TableActionIconButton>
                    </IfCan>
                    <IfCan action={PERMISSIONS.POLICIES_DELETE}>
                        <TableActionIconButton colorPalette="red" label={t("ui_text:delete")} onClick={() => onDeleteRequest(p)}>
                            <Trash2 size={16} aria-hidden="true" />
                        </TableActionIconButton>
                    </IfCan>
                </HStack>
            ),
        },
    ];
}
