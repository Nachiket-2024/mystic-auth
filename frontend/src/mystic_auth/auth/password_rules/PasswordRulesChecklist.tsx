import React from "react";
import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import { Check, Circle, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { PasswordRules } from "./passwordRules";

interface PasswordRulesChecklistProps {
    rules: PasswordRules;
    fontSize?: string;
    /**
     * True before the user has typed anything into the password field.
     * An empty password trivially fails every rule, so rendering that as
     * four red X's on first paint (before the user has done anything
     * "wrong") reads as an alarm rather than guidance. Pristine renders a
     * neutral, ungraded state instead; the first keystroke turns it back
     * into the normal red/green pass-fail checklist.
     */
    pristine?: boolean;
}

/**
 * Shared pass/fail checklist for SignupForm and PasswordResetConfirmForm.
 * Wrapped in aria-live="polite" so screen-reader users hear each rule's
 * status update as they type, instead of relying on the red/green icon
 * alone.
 */
const PasswordRulesChecklist: React.FC<PasswordRulesChecklistProps> = ({ rules, fontSize = "md", pristine = false }) => {
    const { t } = useTranslation("auth");

    const rule = (passed: boolean, label: string) => (
        <HStack gap={1} color={pristine ? "fg.muted" : passed ? "fg.success" : "fg.error"}>
            {pristine ? (
                <Circle size={8} fill="currentColor" aria-hidden="true" />
            ) : passed ? (
                <Check size={14} aria-hidden="true" />
            ) : (
                <X size={14} aria-hidden="true" />
            )}
            <Text as="span">{label}</Text>
        </HStack>
    );

    return (
        <Box
            fontSize={fontSize}
            color="fg.muted"
            textAlign="center"
            display="flex"
            flexDirection="column"
            alignItems="center"
            aria-live="polite"
        >
            <Stack direction="row" gap={6}>
                {rule(rules.lengthRule, t("passwordRules.minLength"))}
                {rule(rules.upperRule, t("passwordRules.upper"))}
            </Stack>
            <Stack direction="row" gap={6}>
                {rule(rules.lowerRule, t("passwordRules.lower"))}
                {rule(rules.numberRule, t("passwordRules.number"))}
            </Stack>
        </Box>
    );
};

export default PasswordRulesChecklist;
