import React from "react";
import { Box, SimpleGrid } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import type { PasswordRules } from "./passwordRules";
import PasswordRuleItem from "./PasswordRuleItem";

interface PasswordRulesChecklistProps {
    rules: PasswordRules;
    fontSize?: string;
    /**
     * True before the user has typed anything. An empty password trivially fails
     * every rule, so rendering four red X's on first paint would read as an alarm
     * rather than guidance. Pristine shows a neutral state instead; the first
     * keystroke switches it to the normal red/green checklist.
     */
    pristine?: boolean;
    /** Number of grid columns. 2 (default) for a standalone, full-width
     * checklist (e.g. ChangePasswordCard); 1 for the compact single-column
     * block used next to the strength meter in PasswordStrengthPanel. */
    columns?: number;
}

/**
 * Shared pass/fail checklist for SignupForm, PasswordResetConfirmForm, and
 * PasswordStrengthPanel. Wrapped in aria-live="polite" so screen readers announce
 * each rule's status as it changes, not just the icon color.
 *
 * Laid out as a `SimpleGrid` with equal-width columns rather than `HStack` rows: an
 * HStack row only takes the width its content needs, so longer translated labels
 * would overflow past the card's edge instead of wrapping. The grid gives each item a
 * fixed column to wrap within.
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
