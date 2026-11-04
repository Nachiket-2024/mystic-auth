/* eslint-disable react-refresh/only-export-components -- this feature module owns both the table cells and its column factory. */
import React, { useState } from "react";

import type { PasskeyCredential } from "../api/passkeys_api";
import type { DataTableColumn } from "../ui/DataTable/DataTable";
import { formatDateTime, formatRelativeTime } from "../ui/dates/dateFormatters";
import { Input } from "../ui/inputs/Input";
import { Label } from "../ui/shadcn/label";
import TableActionButton from "../ui/table_actions/TableActionButton";
import { DESTRUCTIVE_TABLE_ACTION_CLASSNAME } from "../ui/table_actions/tableActionPalettes";
import type { SupportedLanguage } from "../translations/translations";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const TwoLineCell: React.FC<{ primary: string; secondary?: string }> = ({ primary, secondary }) => (
    <div className="overflow-hidden">
        <p className="text-sm font-medium truncate" title={primary}>{primary}</p>
        {secondary && <p className="text-[13px] leading-tight text-fg-muted truncate" title={secondary}>{secondary}</p>}
    </div>
);

interface NameCellProps {
    passkey: PasskeyCredential;
    t: Translate;
    isSaving: boolean;
    onRename: (name: string) => void;
}

// Own component so each row keeps its own draft while typing. The name saves
// itself on Enter or when focus leaves the field (Escape reverts), so rows
// need no separate Rename button. An unchanged or empty name saves nothing.
const NameCell: React.FC<NameCellProps> = ({ passkey, t, isSaving, onRename }) => {
    const [name, setName] = useState(passkey.name);
    const commit = () => {
        const next = name.trim();
        if (!next) setName(passkey.name);
        else if (next !== passkey.name) onRename(next);
    };
    return (
        // max-w-sm: the name column takes all spare width, and a 64-character
        // name never needs more than this, so the field stays a normal size
        // however wide the table gets.
        <div className="min-w-0 max-w-sm">
            <Label htmlFor={`passkey-${passkey.id}`} className="sr-only">{t("passkeys.renameNamed", { name: passkey.name })}</Label>
            <Input id={`passkey-${passkey.id}`} value={name} maxLength={64} disabled={isSaving} className="min-w-0"
                onChange={(event) => setName(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setName(passkey.name);
                }} />
        </div>
    );
};

interface PasskeyTableOptions {
    t: Translate;
    language: SupportedLanguage;
    now: number;
    isRenaming: boolean;
    onRename: (id: number, name: string) => void;
    onRemove: (passkey: PasskeyCredential) => void;
}

export function createPasskeyColumns({ t, language, now, isRenaming, onRename, onRemove }: PasskeyTableOptions): DataTableColumn<PasskeyCredential>[] {
    return [
        {
            key: "name",
            header: t("passkeys.nameColumn"),
            render: (passkey) => <NameCell passkey={passkey} t={t} isSaving={isRenaming}
                onRename={(name) => onRename(passkey.id, name)} />,
        },
        {
            key: "created_at",
            header: t("passkeys.addedColumn"),
            width: "9.5rem",
            render: (passkey) => <TwoLineCell primary={formatRelativeTime(passkey.created_at, language, now)} secondary={formatDateTime(passkey.created_at, language)} />,
        },
        {
            key: "last_used_at",
            header: t("passkeys.lastUsedColumn"),
            width: "9.5rem",
            render: (passkey) => passkey.last_used_at
                ? <TwoLineCell primary={formatRelativeTime(passkey.last_used_at, language, now)} secondary={formatDateTime(passkey.last_used_at, language)} />
                : <span className="text-sm text-fg-muted">{t("passkeys.neverUsed")}</span>,
        },
        {
            key: "row_actions",
            header: "",
            align: "end",
            width: "6rem",
            render: (passkey) => <TableActionButton colorPalette="red" className={DESTRUCTIVE_TABLE_ACTION_CLASSNAME}
                aria-label={t("passkeys.removeNamed", { name: passkey.name })} onClick={() => onRemove(passkey)}>
                {t("passkeys.removeButton")}
            </TableActionButton>,
        },
    ];
}
