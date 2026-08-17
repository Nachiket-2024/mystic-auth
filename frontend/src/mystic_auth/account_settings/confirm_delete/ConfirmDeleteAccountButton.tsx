import React, { useEffect, useRef } from "react";
import { Stack, Button, Spinner } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { useConfirmDeleteMyAccountMutation } from "./useConfirmDeleteMyAccountMutation";
import { DESTRUCTIVE_SOLID_HOVER_PROPS } from "../../ui/styles/buttonStyles";
import FormAlert from "../../ui/FormAlert";

interface ConfirmDeleteAccountButtonProps {
    token: string;
    onSuccess?: () => void;
}

// Mirrors VerifyAccountButton.tsx: a deliberate click (not auto-fired on
// page load) redeems the token, same reasoning - a link that gets
// prefetched/scanned by an email client or link-preview bot before the
// human ever opens it must not silently consume a single-use token.
const ConfirmDeleteAccountButton: React.FC<ConfirmDeleteAccountButtonProps> = ({ token, onSuccess }) => {
    const { t } = useTranslation("account_settings");
    const confirmMutation = useConfirmDeleteMyAccountMutation();

    // Same "fire onSuccess exactly once, via a ref" reasoning as
    // VerifyAccountButton.tsx.
    const onSuccessRef = useRef(onSuccess);
    const firedRef = useRef(false);

    useEffect(() => {
        onSuccessRef.current = onSuccess;
    });

    useEffect(() => {
        if (confirmMutation.isSuccess && !firedRef.current) {
            firedRef.current = true;
            onSuccessRef.current?.();
        }
    }, [confirmMutation.isSuccess]);

    const handleConfirm = () => {
        confirmMutation.mutate({ token });
    };

    return (
        <Stack align="center" w="full">
            <Button
                onClick={handleConfirm}
                colorPalette="red"
                size="lg"
                w="full"
                disabled={!token || confirmMutation.isSuccess}
                {...DESTRUCTIVE_SOLID_HOVER_PROPS}
            >
                {confirmMutation.isPending ? (
                    <>
                        <Spinner size="sm" mr={2} /> {t("confirmDeleteButton.confirming")}
                    </>
                ) : (
                    t("confirmDeleteButton.submitButton")
                )}
            </Button>

            {confirmMutation.isError && (
                <FormAlert status="error">{confirmMutation.error.message}</FormAlert>
            )}

            {confirmMutation.isSuccess && (
                <FormAlert status="success">{confirmMutation.data.message}</FormAlert>
            )}
        </Stack>
    );
};

export default ConfirmDeleteAccountButton;
