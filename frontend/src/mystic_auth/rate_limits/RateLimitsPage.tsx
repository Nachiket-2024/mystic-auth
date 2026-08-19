import React, { useState } from "react";
import { Text } from "@chakra-ui/react";
import { Gauge, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import PageContainer from "../ui/PageContainer";
import DataTable from "../ui/DataTable/DataTable";
import Pagination from "../ui/Pagination";
import ConfirmDialog from "../ui/ConfirmDialog";
import { toaster } from "../ui/toaster/toasterInstance";
import { useLanguageStore } from "../store/languageStore";
import { useDebouncedValue } from "../ui/hooks/useDebouncedValue";
import { useSortState } from "../ui/hooks/useSortState";
import { usePageResetOn } from "../ui/hooks/usePageResetOn";
import { useRateLimitsQuery } from "./rateLimitsQueries";
import { useResetRateLimitMutation } from "./rateLimitsMutations";
import RateLimitsFilterBar, { ALL_VALUE } from "./RateLimitsFilterBar";
import { buildRateLimitsColumns } from "./rateLimitsColumns";
import { sortRateLimitEntries } from "./sortRateLimitEntries";
import { totalPagesFor } from "./rateLimitsListConfig";
import type { RateLimitEntry } from "../api/rate_limits_api";

// Small enough that one page of rows fits within a normal viewport without
// DataTable's own inner Table.ScrollArea ever having to kick in (see
// DataTable.tsx's maxH="70dvh").
const PAGE_SIZE = 10;

/**
 * RateLimitsPage
 * ----------------------------
 * Admin view of live Redis-backed rate-limit counters (see
 * rate_limiter_service.py), gated by rate_limits:read (resetting a counter
 * is its own, separate rate_limits:reset action - see IfCan in
 * rateLimitsColumns.tsx). Numbered pagination, same shape as the audit log
 * tables: the backend walks the matching Redis keyspace (bounded, see
 * list_active_limits' docstring) to compute a real total and slice out one
 * page. Sorting is client-side over only the current page - see
 * sortRateLimitEntries.
 */
const RateLimitsPage: React.FC = () => {
    const { t } = useTranslation("rate_limits");
    const language = useLanguageStore((s) => s.chromeLanguage);
    const [endpoint, setEndpoint] = useState("");
    const [identifier, setIdentifier] = useState("");
    const debouncedIdentifier = useDebouncedValue(identifier);
    const [scope, setScope] = useState(ALL_VALUE);
    const { sort, toggleSort } = useSortState("endpoint", "asc");
    const [resettingEntry, setResettingEntry] = useState<RateLimitEntry | null>(null);

    const filters = {
        endpoint: endpoint || undefined,
        identifier: debouncedIdentifier || undefined,
        scope: (scope || undefined) as "ip" | "account" | "email" | undefined,
    };

    const [page, setPage] = usePageResetOn(`${endpoint}|${debouncedIdentifier}|${scope}`);

    const { data, isLoading, isError } = useRateLimitsQuery(page, PAGE_SIZE, filters);
    const resetMutation = useResetRateLimitMutation();

    const entries = sortRateLimitEntries(data?.entries ?? [], sort);
    const totalPages = totalPagesFor(data?.total ?? 0, PAGE_SIZE);

    const handleConfirmReset = () => {
        if (!resettingEntry) return;
        resetMutation.mutate(resettingEntry.key, {
            onSuccess: () => {
                toaster.create({ title: t("page.resetToast"), type: "success" });
                setResettingEntry(null);
            },
            onError: (error) => {
                toaster.create({ title: error.message, type: "error" });
                setResettingEntry(null);
            },
        });
    };

    const columns = buildRateLimitsColumns({
        t,
        language,
        onResetRequest: setResettingEntry,
        resettingKey: resetMutation.isPending ? resetMutation.variables : undefined,
    });

    return (
        <PageContainer
            title={t("page.title")}
            icon={Gauge}
            description={t("page.description")}
            headerExtra={
                <RateLimitsFilterBar
                    endpoint={endpoint} setEndpoint={setEndpoint}
                    identifier={identifier} setIdentifier={setIdentifier}
                    scope={scope} setScope={setScope}
                />
            }
        >
            {data?.truncated && (
                <Text fontSize="sm" color="fg.muted" mb={2}>
                    {t("page.truncatedNote")}
                </Text>
            )}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mb={4} />
            <DataTable
                columns={columns}
                rows={entries}
                rowKey={(e) => e.key}
                isLoading={isLoading}
                isError={isError}
                errorMessage={t("page.failedToLoad")}
                emptyMessage={t("page.noActiveLimits")}
                emptyIcon={<ShieldAlert size={32} aria-hidden="true" />}
                sort={sort}
                onSortChange={toggleSort}
                startIndex={(page - 1) * PAGE_SIZE}
            />
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} mt={4} />

            <ConfirmDialog
                isOpen={!!resettingEntry}
                title={t("page.resetDialogTitle")}
                description={t("page.resetDialogDescription", {
                    endpoint: resettingEntry?.endpoint,
                    identifier: resettingEntry?.identifier,
                })}
                confirmLabel={t("page.reset")}
                isDestructive
                isLoading={resetMutation.isPending}
                onConfirm={handleConfirmReset}
                onCancel={() => setResettingEntry(null)}
            />
        </PageContainer>
    );
};

export default RateLimitsPage;
