import { Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";

import Badge from "../../ui/Badge";
import type { DataTableColumn } from "../../ui/DataTable/DataTable";
import type { SecurityAuditLogEntryRead } from "../../api/audit_api";
import type { SupportedLanguage } from "../../translations/translations";
import { formatTimestamp } from "../auditLogListConfig";

// Every column is sortable: `key` doubles as the sort key sent to the backend, and each one
// matches an allowlisted sortable column (see audit_log/audit_log_repository.py's
// _SORTABLE_COLUMNS). A function, not a plain constant, so headers/badge text can use the
// caller's own `t`.
export function getSecurityColumns(t: TFunction<"audit_log">, language: SupportedLanguage): DataTableColumn<SecurityAuditLogEntryRead>[] {
    return [
        { key: "created_at", header: t("security.columns.when"), width: "11.875rem", truncate: true, render: (e) => formatTimestamp(e.created_at, language), sortable: true },
        {
            key: "user_email",
            header: t("security.columns.user"),
            width: "16rem",
            truncate: true,
            // Genuinely unattributable, not a bug: the refresh token behind this event
            // (logout/logout-all) was expired or undecodable by log time, so there's no
            // payload to recover an email from (see logout_handler.py). A muted label reads
            // as "no identity available" instead of a rendering bug.
            render: (e) => e.user_email ?? <Text color="fg.muted">{t("security.columns.unknownUser")}</Text>,
            sortable: true,
        },
        { key: "event_type", header: t("security.columns.event"), width: "14rem", truncate: true, render: (e) => e.event_type, sortable: true },
        {
            key: "ip_address",
            header: t("security.columns.ip"),
            width: "9.375rem",
            truncate: true,
            render: (e) => e.ip_address ?? <Text color="fg.muted">{t("security.columns.unknownIp")}</Text>,
            sortable: true,
        },
        {
            key: "success",
            header: t("security.columns.result"),
            width: "7.5rem",
            render: (e) => (
                <Badge colorPalette={e.success ? "green" : "red"} size="md">
                    {e.success ? t("security.results.success") : t("security.results.failed")}
                </Badge>
            ),
            sortable: true,
        },
    ];
}
