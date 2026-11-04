import React from "react";
import { MousePointerClick, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import AppTooltip from "../ui/feedback/AppTooltip";
import { Button } from "../ui/buttons/Button";
import TableActionButton from "../ui/table_actions/TableActionButton";
import { DESTRUCTIVE_TABLE_ACTION_CLASSNAME } from "../ui/table_actions/tableActionPalettes";

interface PasskeysBulkToolbarProps {
    selectedCount: number;
    rowClickSelects: boolean;
    onToggleRowClickSelects: () => void;
    onRemoveSelected: () => void;
    onClearSelection: () => void;
}

/** Selection controls above the table, same layout as the Active Sessions card's toolbar. */
const PasskeysBulkToolbar: React.FC<PasskeysBulkToolbarProps> = ({
    selectedCount,
    rowClickSelects,
    onToggleRowClickSelects,
    onRemoveSelected,
    onClearSelection,
}) => {
    const { t } = useTranslation("account_settings");
    return (
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <span className="text-sm text-fg-muted">{t("ui_text:selectedCount", { count: selectedCount })}</span>
            <div className="flex items-center gap-2 flex-wrap">
                <AppTooltip content={t("passkeys.selectModeHint")}>
                    <Button size="sm" variant={rowClickSelects ? "brand" : "outline"}
                        className={rowClickSelects ? undefined : "border-border-strong bg-bg-surface text-fg-muted hover:bg-brand-subtle hover:border-brand-solid hover:text-brand-fg"}
                        onClick={onToggleRowClickSelects} aria-pressed={rowClickSelects}>
                        <MousePointerClick size={14} aria-hidden="true" />
                        {t("passkeys.selectMode")}
                    </Button>
                </AppTooltip>
                <TableActionButton size="sm" colorPalette="red" className={DESTRUCTIVE_TABLE_ACTION_CLASSNAME}
                    disabled={selectedCount === 0} onClick={onRemoveSelected}>
                    {t("passkeys.removeSelected")}
                </TableActionButton>
                <Button size="sm" variant="secondary" disabled={selectedCount === 0} onClick={onClearSelection}>
                    <X size={14} aria-hidden="true" />
                    {t("ui_text:clearSelection")}
                </Button>
            </div>
        </div>
    );
};

export default PasskeysBulkToolbar;
