import React from "react";
import { Box, HStack, Text } from "@chakra-ui/react";

import { checkPasswordRules, evaluatePasswordStrength } from "./passwordRules";

interface PasswordStrengthMeterProps {
    password: string;
    /** Pre-translated "Strength: Weak"/"Strength: -" text (the exact
     * translation key differs per caller's namespace - auth vs
     * account_settings - so callers own the `t()` call, this component
     * only owns how it's drawn). */
    label: string;
    mt?: number | string;
}

const SEGMENT_COUNT = 4;

/**
 * Segmented strength bar + label. A visual upgrade over the old plain
 * colored text alone, not a new strength concept: the fill count is the
 * literal number of the 4 rules (length/upper/lower/digit) the password
 * currently passes, and those are exactly the rules password_service.
 * validate_password_strength enforces on the backend (see passwordRules.ts's
 * own docstring) - so every segment shown here corresponds to something the
 * backend actually checks, nothing invented (no entropy score, no
 * special-char bonus, no breach-list check - the backend has none of those
 * either).
 */
const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password, label, mt }) => {
    const rules = checkPasswordRules(password);
    const strength = evaluatePasswordStrength(password);
    const filled = Object.values(rules).filter(Boolean).length;

    const color =
        strength === "Weak" ? "red.500" :
        strength === "Medium" ? "orange.400" :
        strength === "Strong" ? "green.500" : "border.default";

    return (
        <Box mt={mt}>
            <HStack gap={1} mb={1} aria-hidden="true">
                {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
                    <Box
                        key={i}
                        h="1"
                        flex="1"
                        borderRadius="full"
                        bg={i < filled ? color : "border.default"}
                        transition="background-color var(--chakra-durations-fast) var(--chakra-easings-hover)"
                    />
                ))}
            </HStack>
            <Text fontSize="sm" fontWeight="bold" color={strength ? color : "fg.muted"}>
                {label}
            </Text>
        </Box>
    );
};

export default PasswordStrengthMeter;
