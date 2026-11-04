import React, { useState } from "react";
import { Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";

import Badge from "../ui/badges/Badge";
import Card from "../ui/cards/Card";
import ConfirmDialog from "../ui/feedback/ConfirmDialog";
import DataTable from "../ui/DataTable/DataTable";
import { useNow } from "../ui/hooks/useNow";
import SectionHeading from "../ui/navigation/SectionHeading";
import TableActionButton from "../ui/table_actions/TableActionButton";
import { DESTRUCTIVE_TABLE_ACTION_CLASSNAME } from "../ui/table_actions/tableActionPalettes";
import { useLanguageStore } from "../store/languageStore";
import { formatNumber } from "../translations/numerals";
import AddPasskeyForm from "./AddPasskeyForm";
import PasskeyStepUpDialog from "./PasskeyStepUpDialog";
import PasskeysBulkToolbar from "./PasskeysBulkToolbar";
import { createPasskeyColumns } from "./passkeysTable";
import { usePasskeyManagement } from "./usePasskeyManagement";
import { useStepUpReturnToast } from "./useStepUpReturnToast";

interface PasskeysCardProps {
    /** Whether the account has a password, which decides if the step-up dialog offers one. */
    hasPassword: boolean;
}

/**
 * Account Settings > Passkeys. Presentation only: the list, the add form, a
 * table with select / remove / rename, bulk removal, and the confirm dialogs.
 * Server calls and their state live in usePasskeyManagement.
 */
const PasskeysCard: React.FC<PasskeysCardProps> = ({ hasPassword }) => {
    const { t } = useTranslation("account_settings");
    // Dates follow the chrome language, same as the Active Sessions card.
    const language = useLanguageStore((s) => s.chromeLanguage);
    const now = useNow(30_000);
    const [rowClickSelects, setRowClickSelects] = useState(false);
    const m = usePasskeyManagement();
    useStepUpReturnToast();

    const total = m.passkeys.data?.length ?? 0;
    const columns = createPasskeyColumns({
        t,
        language,
        now,
        isRenaming: m.rename.isPending,
        onRename: (id, name) => m.rename.mutate({ id, name }),
        onRemove: m.setPendingRemoval,
    });

    return (
        <>
            <Card className="p-5 w-full">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <div className="flex items-center gap-2">
                        <SectionHeading className="flex items-center gap-2">
                            <Fingerprint size={17} aria-hidden="true" color="var(--brand-solid)" />
                            {t("passkeys.title")}
                        </SectionHeading>
                        {/* Count beside the heading, not inside it, so the heading's
                            accessible name stays "Passkeys"; screen readers get the full phrase. */}
                        {m.passkeys.data && (
                            <>
                                <Badge colorPalette="brand" variant="subtle" size="sm" className="rounded-full" aria-hidden="true">
                                    {formatNumber(total, language)}
                                </Badge>
                                <span className="sr-only">{t("passkeys.count", { count: total })}</span>
                            </>
                        )}
                    </div>
                    {total > 1 && (
                        <TableActionButton size="sm" colorPalette="red" className={DESTRUCTIVE_TABLE_ACTION_CLASSNAME}
                            loading={m.bulkRemove.isPending && m.bulkConfirm === "all"} onClick={() => m.setBulkConfirm("all")}>
                            {t("passkeys.removeAll")}
                        </TableActionButton>
                    )}
                </div>
                <p className="text-sm text-fg-muted mb-4">{t("passkeys.description")}</p>
                <AddPasskeyForm name={m.newName} onNameChange={m.setNewName} onSubmit={(name) => m.add.mutate(name)}
                    isPending={m.add.isPending} />
                {total > 1 && (
                    <PasskeysBulkToolbar
                        selectedCount={m.selectedIds.size}
                        rowClickSelects={rowClickSelects}
                        onToggleRowClickSelects={() => setRowClickSelects((value) => !value)}
                        onRemoveSelected={() => m.setBulkConfirm("selected")}
                        onClearSelection={() => m.setSelectedIds(new Set())}
                    />
                )}
                <DataTable
                    ariaLabel={t("passkeys.title")}
                    columns={columns}
                    rows={m.passkeys.data}
                    rowKey={(passkey) => passkey.id}
                    isLoading={m.passkeys.isLoading}
                    isError={m.passkeys.isError}
                    errorMessage={t("passkeys.loadFailed")}
                    emptyMessage={t("passkeys.empty")}
                    emptyIcon={<Fingerprint size={32} aria-hidden="true" />}
                    rowClickSelects={rowClickSelects}
                    selectable={total > 1}
                    selectedKeys={m.selectedIds}
                    onSelectionChange={m.setSelectedIds}
                />
            </Card>
            <PasskeyStepUpDialog
                isOpen={!!m.stepUpRetry}
                hasPassword={hasPassword}
                hasPasskey={total > 0}
                onConfirmed={m.resumeAfterStepUp}
                onCancel={m.cancelStepUp}
            />
            <ConfirmDialog isOpen={m.bulkConfirm !== null}
                title={m.bulkConfirm === "all" ? t("passkeys.removeAllDialog.title") : t("passkeys.bulkDialog.title", { count: m.selectedIds.size })}
                description={m.bulkConfirm === "all" ? t("passkeys.removeAllDialog.description") : t("passkeys.bulkDialog.description", { count: m.selectedIds.size })}
                confirmLabel={m.bulkConfirm === "all" ? t("passkeys.removeAllDialog.confirmLabel") : t("passkeys.bulkDialog.confirmLabel")}
                isLoading={m.bulkRemove.isPending} onConfirm={m.confirmBulk} onCancel={() => m.setBulkConfirm(null)} />
            <ConfirmDialog isOpen={!!m.pendingRemoval} title={t("passkeys.removeTitle")}
                description={t("passkeys.removeDescription", { name: m.pendingRemoval?.name ?? "" })}
                confirmLabel={t("passkeys.removeButton")} isLoading={m.remove.isPending}
                onConfirm={() => m.pendingRemoval && m.remove.mutate(m.pendingRemoval.id)}
                onCancel={() => m.setPendingRemoval(null)} />
        </>
    );
};

export default PasskeysCard;
