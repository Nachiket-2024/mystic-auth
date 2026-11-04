import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useTranslation } from "react-i18next";

import {
    PASSKEYS_QUERY_KEY,
    STEP_UP_REQUIRED_CODE,
    beginPasskeyRegistrationApi,
    bulkRemovePasskeysApi,
    completePasskeyRegistrationApi,
    listPasskeysApi,
    removePasskeyApi,
    renamePasskeyApi,
    type BulkRemovePayload,
    type PasskeyCredential,
} from "../api/passkeys_api";
import { extractApiErrorMessage } from "../api/apiError";
import { toaster } from "../ui/toaster/toasterInstance";

// The server answers 403 with this code when adding or removing a passkey needs
// a fresh "confirm it's you" check (see passkey_step_up_handler.py).
function needsStepUp(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.data?.code === STEP_UP_REQUIRED_CODE;
}

/**
 * Everything the Passkeys tab does with the server: the list, add, rename,
 * remove, and bulk remove, plus the UI state those actions share (selection,
 * which confirm dialog is open, the add-form draft).
 *
 * Step-up retry: when a change is rejected because the login is too old, the
 * action is not lost. It is parked in `stepUpRetry`, the step-up dialog opens,
 * and once the user confirms the same action runs again by itself.
 */
export function usePasskeyManagement() {
    const { t } = useTranslation("account_settings");
    const queryClient = useQueryClient();
    const [newName, setNewName] = useState("");
    const [pendingRemoval, setPendingRemoval] = useState<PasskeyCredential | null>(null);
    const [bulkConfirm, setBulkConfirm] = useState<"selected" | "all" | null>(null);
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string | number>>(new Set());
    const [stepUpRetry, setStepUpRetry] = useState<(() => void) | null>(null);

    const passkeys = useQuery({
        queryKey: PASSKEYS_QUERY_KEY,
        queryFn: async () => (await listPasskeysApi()).data,
    });
    const refresh = () => queryClient.invalidateQueries({ queryKey: PASSKEYS_QUERY_KEY });
    const fail = (error: unknown, fallback: string) =>
        toaster.create({ title: extractApiErrorMessage(error, fallback), type: "error" });

    const add = useMutation({
        mutationFn: async (name: string) => {
            // Options first: a step-up rejection happens here, before the browser's passkey prompt.
            const options = await beginPasskeyRegistrationApi(name);
            const credential = await startRegistration({ optionsJSON: options.data });
            await completePasskeyRegistrationApi(name, credential);
        },
        onSuccess: () => {
            setNewName("");
            refresh();
            toaster.create({ title: t("passkeys.addedToast"), type: "success" });
        },
        onError: (error, name) => {
            if (needsStepUp(error)) return setStepUpRetry(() => () => add.mutate(name));
            fail(error, t("passkeys.addFailed"));
        },
    });

    // Rename is not step-up gated on the server (it cannot grant access).
    const rename = useMutation({
        mutationFn: async ({ id, name }: { id: number; name: string }) => renamePasskeyApi(id, name),
        onSuccess: () => {
            refresh();
            toaster.create({ title: t("passkeys.renamedToast"), type: "success" });
        },
        onError: (error) => fail(error, t("passkeys.renameFailed")),
    });

    const remove = useMutation({
        mutationFn: async (id: number) => removePasskeyApi(id),
        onSuccess: () => {
            setPendingRemoval(null);
            setSelectedIds(new Set());
            refresh();
            toaster.create({ title: t("passkeys.removedToast"), type: "success" });
        },
        onError: (error, id) => {
            setPendingRemoval(null);
            if (needsStepUp(error)) return setStepUpRetry(() => () => remove.mutate(id));
            fail(error, t("passkeys.removeFailed"));
        },
    });

    // One request for "Remove selected" or "Remove all", applied atomically by the server.
    const bulkRemove = useMutation({
        mutationFn: async (payload: BulkRemovePayload) => (await bulkRemovePasskeysApi(payload)).data,
        onSuccess: (result) => {
            setBulkConfirm(null);
            setSelectedIds(new Set());
            refresh();
            toaster.create({ title: t("passkeys.bulkRemovedToast", { count: result.removed }), type: "success" });
        },
        onError: (error, payload) => {
            setBulkConfirm(null);
            if (needsStepUp(error)) return setStepUpRetry(() => () => bulkRemove.mutate(payload));
            fail(error, t("passkeys.bulkRemoveFailed"));
        },
    });

    const confirmBulk = () => {
        if (bulkConfirm === "all") bulkRemove.mutate({ all: true });
        else bulkRemove.mutate({ ids: [...selectedIds] as number[] });
    };

    return {
        passkeys,
        add,
        rename,
        remove,
        bulkRemove,
        confirmBulk,
        newName,
        setNewName,
        pendingRemoval,
        setPendingRemoval,
        bulkConfirm,
        setBulkConfirm,
        selectedIds,
        setSelectedIds,
        stepUpRetry,
        // Called by the step-up dialog: run the parked action, or drop it on cancel.
        resumeAfterStepUp: () => {
            stepUpRetry?.();
            setStepUpRetry(null);
        },
        cancelStepUp: () => setStepUpRetry(null),
    };
}
