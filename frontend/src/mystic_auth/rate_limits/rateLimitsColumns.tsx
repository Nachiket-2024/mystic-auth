import { Badge, Text } from "@chakra-ui/react";
import type { TFunction } from "i18next";

import type { DataTableColumn } from "../ui/DataTable/DataTable";
import TableActionButton from "../ui/table_actions/TableActionButton";
import { formatDateTime } from "../ui/dateFormat";
import type { SupportedLanguage } from "../translations/translations";
import type { RateLimitEntry } from "../api/rate_limits_api";
import { IfCan } from "../authorization/IfCan";
import { PERMISSIONS } from "../authorization/permissions";

const SCOPE_COLOR_PALETTE: Record<RateLimitEntry["scope"], string> = {
    ip: "brand",
    account: "purple",
    email: "orange",
};

interface BuildRateLimitsColumnsParams {
    t: TFunction<"rate_limits">;
    language: SupportedLanguage;
    onResetRequest: (entry: RateLimitEntry) => void;
    resettingKey: string | undefined;
}

/** Same "columns as a function of page state" shape as usersColumns.tsx's
 * buildUsersColumns - the Reset action needs the page's own confirm-dialog
 * state and in-flight mutation.
 *
 * Every data column is sortable, but unlike audit_log's columns this is a
 * client-side sort over only the currently-loaded page(s) (see
 * RateLimitsPage.tsx) - the backend is a Redis SCAN cursor, not a SQL
 * table, so there's no cheap way to sort the *entire* live keyspace without
 * materializing it, which list_active_limits deliberately avoids doing. */
export function buildRateLimitsColumns({
    t,
    language,
    onResetRequest,
    resettingKey,
}: BuildRateLimitsColumnsParams): DataTableColumn<RateLimitEntry>[] {
    return [
        { key: "endpoint", header: t("page.endpointColumn"), width: "12rem", truncate: true, render: (e) => e.endpoint, sortable: true },
        {
            key: "scope",
            header: t("page.scopeColumn"),
            width: "10rem",
            render: (e) => (
                <Badge colorPalette={SCOPE_COLOR_PALETTE[e.scope]} variant="subtle" textTransform="uppercase">
                    {e.scope === "ip" ? t("page.scopeIp") : e.scope === "account" ? t("page.scopeAccount") : t("page.scopeEmail")}
                </Badge>
            ),
            sortable: true,
        },
        {
            // One column for both cases instead of two side-by-side ones:
            // an "ip" row's identifier IS an IP, an "account"/"email" row's
            // identifier IS an email - never both at once for the same row
            // (see rate_limiter_service.py / login_protection_service.py),
            // so a second column would only ever hold a dash. The Scope
            // badge already tells you which kind of value this is.
            key: "identifier",
            header: t("page.identifierColumn"),
            width: "16rem",
            truncate: true,
            render: (e) => e.identifier,
            sortable: true,
        },
        {
            key: "requests",
            header: t("page.requestsColumn"),
            width: "8rem",
            render: (e) => (
                <Text color={e.count >= e.limit ? "fg.error" : undefined} fontWeight={e.count >= e.limit ? "medium" : undefined}>
                    {e.count} / {e.limit}
                </Text>
            ),
            sortable: true,
        },
        {
            key: "resets_at",
            header: t("page.resetsAtColumn"),
            width: "11.875rem",
            truncate: true,
            render: (e) => {
                if (e.resets_in_seconds == null) return t("page.noExpiry");
                const resetsAt = new Date(Date.now() + e.resets_in_seconds * 1000).toISOString();
                return <Text fontSize="md">{formatDateTime(resetsAt, language)}</Text>;
            },
            sortable: true,
        },
        {
            key: "row_actions",
            header: "",
            align: "end",
            width: "7rem",
            render: (e) => (
                <IfCan action={PERMISSIONS.RATE_LIMITS_RESET}>
                    <TableActionButton colorPalette="red" onClick={() => onResetRequest(e)} loading={resettingKey === e.key}>
                        {t("page.reset")}
                    </TableActionButton>
                </IfCan>
            ),
        },
    ];
}
