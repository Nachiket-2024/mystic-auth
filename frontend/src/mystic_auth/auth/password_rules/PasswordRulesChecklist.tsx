import React from "react";
import { Box, SimpleGrid } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import type { PasswordRules } from "./passwordRules";
import PasswordRuleItem from "./PasswordRuleItem";

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
    /** Number of grid columns. 2 (default) for a standalone, full-width
     * checklist (e.g. ChangePasswordCard); 1 for the compact single-column
     * block used next to the strength meter in PasswordStrengthPanel. */
    columns?: number;
}

/**
 * Shared pass/fail checklist for SignupForm, PasswordResetConfirmForm, and
 * PasswordStrengthPanel. Wrapped in aria-live="polite" so screen-reader
 * users hear each rule's status update as they type, instead of relying on
 * the red/green icon alone.
 *
 * Laid out as a `SimpleGrid` with two *equal-width* columns rather than two
 * `HStack` rows: an HStack row only ever takes the width its content needs,
 * so on a translated locale with longer labels (or inside a narrower panel)
 * the row would demand more width than its container had and overflow past
 * the card's edge instead of wrapping. A grid instead gives each item a
 * fixed 50% column to wrap within, so it never grows past its container
 * regardless of label length.
 */
const PasswordRulesChecklist: React.FC<PasswordRulesChecklistProps> = ({ rules, fontSize = "md", pristine = false, columns = 2 }) => {
    const { t } = useTranslation("auth");

    return (
        <Box fontSize={fontSize} color="fg.muted" aria-live="polite">
            <SimpleGrid columns={columns} columnGap={4} rowGap={1}>
                <PasswordRuleItem passed={rules.lengthRule} label={t("passwordRules.minLength")} pristine={pristine} />
                <PasswordRuleItem passed={rules.upperRule} label={t("passwordRules.upper")} pristine={pristine} />
                <PasswordRuleItem passed={rules.lowerRule} label={t("passwordRules.lower")} pristine={pristine} />
                <PasswordRuleItem passed={rules.numberRule} label={t("passwordRules.number")} pristine={pristine} />
            </SimpleGrid>
        </Box>
    );
};

export default PasswordRulesChecklist;
