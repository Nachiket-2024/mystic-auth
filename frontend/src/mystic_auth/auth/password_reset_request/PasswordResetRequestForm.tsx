import React, { useState } from "react";
import { Stack, Input, Button } from "@chakra-ui/react";
import { Field as ChakraField } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { usePasswordResetRequestMutation } from "./usePasswordResetRequestMutation";
import { useCooldown } from "../../ui/hooks/useCooldown";
import FormAlert from "../../ui/FormAlert";
import { FAST_HOVER_TRANSITION } from "../../theme/system";
import { useLanguageStore } from "../../store/languageStore";
import { formatNumber } from "../../translations/numerals";

const PasswordResetRequestForm: React.FC = () => {
    const { t } = useTranslation("auth");
    // chromeLanguage, not pageLanguage: numerals stay in English/ASCII digits
    // even in a mixed "en+hi" mode, the same way dates already do (see
    // dateFormat.ts's callers) - only translated text switches with pageLanguage.
    const language = useLanguageStore((s) => s.chromeLanguage);
    const [email, setEmail] = useState("");
    const { cooldown, startCooldown } = useCooldown();

    const resetRequestMutation = usePasswordResetRequestMutation();

    const handleSubmit = (e: React.SubmitEvent<HTMLDivElement>) => {
        e.preventDefault();

        if (cooldown > 0) {
            return;
        }

        resetRequestMutation.mutate({ email });
        startCooldown();
    };

    return (
        <Stack as="form" onSubmit={handleSubmit} w="full">
            <ChakraField.Root required>
                <ChakraField.Label>{t("passwordResetRequest.emailLabel")}</ChakraField.Label>
                <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("passwordResetRequest.emailPlaceholder")}
                    size="lg"
                    autoFocus
                    disabled={resetRequestMutation.isPending}
                />
            </ChakraField.Root>

            {/* Solid variant's default hover is only colorPalette.solid at 90%
                opacity - too subtle a shift to read as a hover state (see
                LoginForm.tsx's Login button for the same fix). */}
            <Button
                type="submit"
                colorPalette="brand"
                size="lg"
                w="full"
                loading={resetRequestMutation.isPending}
                disabled={cooldown > 0 || resetRequestMutation.isPending}
                loadingText={t("passwordResetRequest.sending")}
                _hover={{ bg: "brand.700" }}
                transition={FAST_HOVER_TRANSITION}
            >
                {cooldown > 0 ? t("passwordResetRequest.tryAgainIn", { seconds: formatNumber(cooldown, language) }) : t("passwordResetRequest.submitButton")}
            </Button>

            {resetRequestMutation.isError && (
                <FormAlert status="error">{resetRequestMutation.error.message}</FormAlert>
            )}

            {resetRequestMutation.isSuccess && (
                <FormAlert status="success">{resetRequestMutation.data.message}</FormAlert>
            )}
        </Stack>
    );
};

export default PasswordResetRequestForm;
