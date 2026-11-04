import React, { useState } from "react";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { useMutation } from "@tanstack/react-query";
import { Fingerprint } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
    beginPasskeyAuthenticationApi,
    confirmWithPasskeyApi,
    confirmWithPasswordApi,
} from "../api/passkeys_api";
import { extractApiErrorMessage } from "../api/apiError";
import { Button } from "../ui/buttons/Button";
import FormAlert from "../ui/feedback/FormAlert";
import PasswordInput from "../ui/inputs/PasswordInput";
import settings from "../core/settings";
import { Label } from "../ui/shadcn/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/shadcn/dialog";
import { DIALOG_FOOTER_CLASSNAME, DIALOG_HEADER_CLASSNAME, DIALOG_PANEL_CLASSNAME } from "../ui/styles/dialogStyles";

interface PasskeyStepUpDialogProps {
    isOpen: boolean;
    hasPassword: boolean;
    hasPasskey: boolean;
    onConfirmed: () => void;
    onCancel: () => void;
}

/**
 * "Sudo mode" prompt shown when the backend answers PASSKEY_STEP_UP_REQUIRED.
 * Confirms identity with the account password, an existing passkey, or (for
 * accounts without a password) a Google re-authentication that returns to this
 * tab. After any of them, the server unlocks passkey changes for 15 minutes on this session.
 * The user is never signed out; the blocked action is retried by the caller
 * through onConfirmed.
 */
const PasskeyStepUpDialog: React.FC<PasskeyStepUpDialogProps> = ({
    isOpen,
    hasPassword,
    hasPasskey,
    onConfirmed,
    onCancel,
}) => {
    const { t } = useTranslation("account_settings");
    const [password, setPassword] = useState("");
    const canUsePasskey = hasPasskey && browserSupportsWebAuthn();

    const reset = () => setPassword("");
    const done = () => {
        reset();
        onConfirmed();
    };
    const withPassword = useMutation({
        mutationFn: async () => confirmWithPasswordApi(password),
        onSuccess: done,
    });
    const withPasskey = useMutation({
        mutationFn: async () => {
            const options = await beginPasskeyAuthenticationApi();
            const credential = await startAuthentication({ optionsJSON: options.data });
            await confirmWithPasskeyApi(credential);
        },
        onSuccess: done,
    });
    const error = withPassword.error ?? withPasskey.error;
    const busy = withPassword.isPending || withPasskey.isPending;
    const cancel = () => {
        reset();
        withPassword.reset();
        withPasskey.reset();
        onCancel();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && cancel()}>
            <DialogContent
                showCloseButton
                className={`${DIALOG_PANEL_CLASSNAME} w-[calc(100%-2rem)] min-w-0 max-w-md`}
            >
                <DialogHeader className={DIALOG_HEADER_CLASSNAME}>
                    <DialogTitle className="text-xl tracking-[-0.02em]">{t("passkeys.stepUp.title")}</DialogTitle>
                </DialogHeader>
                <form
                    className="flex flex-col gap-4 bg-bg-canvas px-5 py-4 sm:px-6 sm:py-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (hasPassword && password) withPassword.mutate();
                    }}
                >
                    <p className="text-[15px] leading-6 text-fg-muted">{t("passkeys.stepUp.description")}</p>
                    {error && (
                        <FormAlert status="error">
                            {extractApiErrorMessage(error, t("passkeys.stepUp.failed"))}
                        </FormAlert>
                    )}
                    {hasPassword && (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="passkey-stepup-password">{t("passkeys.stepUp.passwordLabel")}</Label>
                            <PasswordInput
                                id="passkey-stepup-password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                            />
                        </div>
                    )}
                    {hasPassword && canUsePasskey && (
                        <div className="text-center text-xs font-semibold uppercase tracking-wide text-fg-muted">
                            {t("passkeys.stepUp.or")}
                        </div>
                    )}
                    {canUsePasskey && (
                        <Button
                            type="button"
                            variant="secondary"
                            loading={withPasskey.isPending}
                            disabled={busy}
                            onClick={() => withPasskey.mutate()}
                        >
                            <Fingerprint size={18} aria-hidden="true" />
                            {t("passkeys.stepUp.usePasskey")}
                        </Button>
                    )}
                    {!hasPassword && (
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                                // Full-page redirect: Google re-authentication, then back to this tab.
                                window.location.href = `${settings.apiBaseUrl}/auth/passkeys/step-up/google`;
                            }}
                        >
                            {t("passkeys.stepUp.google")}
                        </Button>
                    )}
                    <DialogFooter className={DIALOG_FOOTER_CLASSNAME}>
                        {hasPassword && (
                            <Button type="submit" variant="brand" loading={withPassword.isPending} disabled={!password || busy}>
                                {t("passkeys.stepUp.confirmPassword")}
                            </Button>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default PasskeyStepUpDialog;
