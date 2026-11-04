import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { translateErrorCode } from "../api/apiError";
import { toaster } from "../ui/toaster/toasterInstance";

/**
 * Shows the result of the Google re-authentication redirect. The backend sends
 * the browser back to /account-settings?tab=passkeys&stepup=<result>, where
 * <result> is "ok" or an error code. It is read once from the URL (no router
 * needed) and then removed, so a refresh does not repeat the toast.
 */
export function useStepUpReturnToast() {
    const { t } = useTranslation("account_settings");
    useEffect(() => {
        const url = new URL(window.location.href);
        const result = url.searchParams.get("stepup");
        if (!result) return;
        url.searchParams.delete("stepup");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        if (result === "ok") {
            toaster.create({ title: t("passkeys.stepUp.confirmedToast"), type: "success" });
        } else {
            toaster.create({ title: translateErrorCode(result) ?? t("passkeys.stepUp.failed"), type: "error" });
        }
    }, [t]);
}
