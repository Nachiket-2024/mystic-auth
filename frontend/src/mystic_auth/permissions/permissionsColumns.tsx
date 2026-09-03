import { HStack, Text } from "@chakra-ui/react";
import { Eye } from "lucide-react";
import type { TFunction } from "i18next";

import Badge from "../ui/Badge";
import type { DataTableColumn } from "../ui/DataTable/DataTable";
import TableActionIconButton from "../ui/table_actions/TableActionIconButton";
import type { PermissionCatalogEntry } from "../api/permissions_api";

interface BuildPermissionsColumnsParams {
    t: TFunction<["permissions", "ui_text"]>;
    onView: (entry: PermissionCatalogEntry) => void;
}

/** Description has no fixed width/truncate, so a long one wraps the row
 * instead of disappearing; the View button covers the case where wrapped
 * text is still awkward to read in the table. */
export function buildPermissionsColumns({ t, onView }: BuildPermissionsColumnsParams): DataTableColumn<PermissionCatalogEntry>[] {
    return [
        {
            key: "action",
            header: t("permissions:columns.action"),
            sortable: true,
            width: "14rem",
            truncate: true,
            render: (entry) => (
                <Badge colorPalette="brand" variant="subtle" fontSize="md" px={2} py={0.5}>
                    {entry.action}
                </Badge>
            ),
        },
        {
            key: "resource_type",
            header: t("permissions:columns.resourceType"),
            sortable: true,
            width: "9.375rem",
            truncate: true,
            render: (entry) => entry.resource_type,
        },
        {
            key: "description",
            header: t("permissions:columns.description"),
            render: (entry) => <Text color="fg.muted">{entry.description}</Text>,
        },
        {
            key: "row_actions",
            header: "",
            align: "end",
            // Icon-only so this stays on one line regardless of locale.
            width: "4rem",
            render: (entry) => (
                <HStack justify="flex-end" gap={1.5} wrap="nowrap">
                    <TableActionIconButton colorPalette="blue" label={t("permissions:columns.view")} onClick={() => onView(entry)}>
                        <Eye size={16} aria-hidden="true" />
                    </TableActionIconButton>
                </HStack>
            ),
        },
    ];
}
