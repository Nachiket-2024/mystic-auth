import React, { useEffect, useRef } from "react";
import { Stack, Button, Spinner } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { useVerifyAccountMutation } from "./useVerifyAccountMutation";
import { BRAND_SOLID_HOVER_PROPS } from "../../ui/styles/buttonStyles";
import FormAlert from "../../ui/FormAlert";

interface VerifyAccountButtonProps {
    token: string;
    email: string;
    onSuccess?: () => void;
}

const VerifyAccountButton: React.FC<VerifyAccountButtonProps> = ({ token, email, onSuccess }) => {
    const { t } = useTranslation("auth");
    const verifyMutation = useVerifyAccountMutation();

    // Fires onSuccess exactly once per successful verification, not once per render
    // where its identity happens to change (most callers pass an inline arrow
    // function). Read via a ref instead of the dependency array, so an unrelated
    // re-render while isSuccess is still true can't re-fire it.
    const onSuccessRef = useRef(onSuccess);
    const firedRef = useRef(false);

    useEffect(() => {
        onSuccessRef.current = onSuccess;
    });

    useEffect(() => {
        if (verifyMutation.isSuccess && !firedRef.current) {
            firedRef.current = true;
            onSuccessRef.current?.();
        }
    }, [verifyMutation.isSuccess]);

    const handleVerify = () => {
        verifyMutation.mutate({ token, email });
    };

    return (
        <Stack align="center" w="full">
            <Button
                onClick={handleVerify}
                colorPalette="brand"
                size="lg"
                w="full"
                {...BRAND_SOLID_HOVER_PROPS}
            >
                {verifyMutation.isPending ? (
                    <>
                        <Spinner size="sm" mr={2} /> {t("verifyAccountButton.verifying")}
                    </>
                ) : (
                    t("verifyAccountButton.submitButton")
                )}
            </Button>

            {verifyMutation.isError && (
                <FormAlert status="error">{verifyMutation.error.message}</FormAlert>
            )}

            {verifyMutation.isSuccess && (
                <FormAlert status="success">{verifyMutation.data.message}</FormAlert>
            )}
        </Stack>
    );
};

export default VerifyAccountButton;
