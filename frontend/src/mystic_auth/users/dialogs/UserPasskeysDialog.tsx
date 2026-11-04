import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
    listUserPasskeysApi,
    revokeAllUserPasskeysApi,
    revokeUserPasskeyApi,
    type ManagedUserRead,
    type UserPasskeyRead,
} from "../../api/users_api";
import { extractApiErrorMessage } from "../../api/apiError";
import { queryClient } from "../../core/queryClient";
import { useLanguageStore } from "../../store/languageStore";
import { Button } from "../../ui/buttons/Button";
import { formatDateTime } from "../../ui/dates/dateFormatters";
import ConfirmDialog from "../../ui/feedback/ConfirmDialog";
import FormAlert from "../../ui/feedback/FormAlert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/shadcn/dialog";
import {
    DIALOG_FOOTER_CLASSNAME,
    DIALOG_HEADER_CLASSNAME,
    DIALOG_PANEL_CLASSNAME,
} from "../../ui/styles/dialogStyles";
import { toaster } from "../../ui/toaster/toasterInstance";

interface UserPasskeysDialogProps {
    user: ManagedUserRead | null;
    onClose: () => void;
}

type PendingRemoval = { kind: "one"; passkey: UserPasskeyRead } | { kind: "all" };

const userPasskeysKey = (email: string) => ["userPasskeys", email] as const;

/** Incident-response view of another user's passkeys (users:manage_passkeys).
 * Shows names and dates only, never credential material, and every removal
 * goes through a confirmation. The backend also emails the user and records
 * who did it, so nothing here needs to. */
const UserPasskeysDialog: React.FC<UserPasskeysDialogProps> = ({ user, onClose }) => {
    const { t } = useTranslation(["users", "ui_text"]);
    const language = useLanguageStore((state) => state.chromeLanguage);
    const [pending, setPending] = useState<PendingRemoval | null>(null);
    const email = user?.email ?? "";

    const passkeysQuery = useQuery({
        queryKey: userPasskeysKey(email),
        queryFn: async () => (await listUserPasskeysApi(email)).data,
        enabled: !!user,
    });

    const removeMutation = useMutation<unknown, Error, PendingRemoval>({
        mutationFn: async (target) => {
            try {
                return target.kind === "all"
                    ? await revokeAllUserPasskeysApi(email)
                    : await revokeUserPasskeyApi(email, target.passkey.id);
            } catch (error) {
                throw new Error(extractApiErrorMessage(error, "Failed to remove passkeys"), { cause: error });
            }
        },
        onSuccess: () => {
            toaster.create({ title: t("users:passkeysDialog.removedToast"), type: "success" });
            setPending(null);
            queryClient.invalidateQueries({ queryKey: userPasskeysKey(email) });
        },
        onError: (error) => {
            toaster.create({ title: error.message, type: "error" });
            setPending(null);
        },
    });

    const passkeys = passkeysQuery.data ?? [];

    return (
        <>
            <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
                <DialogContent
                    closeLabel={t("ui_text:closeDialog")}
                    className={`${DIALOG_PANEL_CLASSNAME} w-[calc(100%-2rem)] max-w-xl`}
                >
                    <DialogHeader className={DIALOG_HEADER_CLASSNAME}>
                        <DialogTitle className="text-xl tracking-[-0.02em]">{t("users:passkeysDialog.title")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 bg-bg-canvas px-5 py-4 sm:px-6">
                        <p className="text-sm text-fg-muted">{t("users:passkeysDialog.description", { email })}</p>
                        {passkeysQuery.isError && <FormAlert status="error">{t("users:passkeysDialog.loadError")}</FormAlert>}
                        {passkeysQuery.isSuccess && passkeys.length === 0 && (
                            <p className="text-sm">{t("users:passkeysDialog.empty")}</p>
                        )}
                        {passkeys.length > 0 && (
                            <ul className="divide-y divide-border rounded-lg border border-border bg-bg-surface">
                                {passkeys.map((passkey) => (
                                    <li key={passkey.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">{passkey.name}</p>
                                            <p className="text-[13px] text-fg-muted">
                                                {t("users:passkeysDialog.created")}: {formatDateTime(passkey.created_at, language)}
                                                {" · "}
                                                {t("users:passkeysDialog.lastUsed")}:{" "}
                                                {passkey.last_used_at
                                                    ? formatDateTime(passkey.last_used_at, language)
                                                    : t("users:passkeysDialog.never")}
                                            </p>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setPending({ kind: "one", passkey })}
                                        >
                                            {t("users:passkeysDialog.remove")}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <DialogFooter className={DIALOG_FOOTER_CLASSNAME}>
                        <Button variant="secondary" onClick={onClose}>
                            {t("ui_text:close")}
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={passkeys.length === 0}
                            onClick={() => setPending({ kind: "all" })}
                        >
                            {t("users:passkeysDialog.removeAll")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                isOpen={!!pending}
                title={t(pending?.kind === "all" ? "users:passkeysDialog.confirmAllTitle" : "users:passkeysDialog.confirmOneTitle")}
                description={
                    pending?.kind === "one"
                        ? t("users:passkeysDialog.confirmOneDescription", { name: pending.passkey.name, email })
                        : t("users:passkeysDialog.confirmAllDescription", { email })
                }
                confirmLabel={t(pending?.kind === "all" ? "users:passkeysDialog.removeAll" : "users:passkeysDialog.remove")}
                isLoading={removeMutation.isPending}
                onConfirm={() => pending && removeMutation.mutate(pending)}
                onCancel={() => setPending(null)}
            />
        </>
    );
};

export default UserPasskeysDialog;
