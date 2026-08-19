import React from "react";
import { Box, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import { ShieldCheck } from "lucide-react";

import type { PasswordRules } from "./passwordRules";
import { evaluatePasswordStrength } from "./passwordRules";
import PasswordRulesChecklist from "./PasswordRulesChecklist";

interface PasswordStrengthPanelProps {
    password: string;
    /** Pre-translated "Strength: Weak"/"Strength: -" text - the exact
     * translation key differs per caller's namespace (auth vs
     * account_settings), so callers own the t() call. */
    label: string;
    rules: PasswordRules;
    pristine?: boolean;
    mt?: number | string;
}

const SEGMENT_COUNT = 4;
/** Fixed narrow width for the strength column, so its bar doesn't stretch
 * to fill the panel - it sits as a compact block beside the checklist
 * rather than spanning the full row. */
const STRENGTH_COLUMN_WIDTH = "112px";

/**
 * Strength (icon + bar + label) on the left, the 4 rules as a compact
 * single-column block on the right (via the shared PasswordRulesChecklist,
 * so this and the standalone checklist can't drift apart visually), the
 * whole panel centered as a unit. Wraps to a stacked layout on narrow
 * viewports so the checklist never gets squeezed.
 */
const PasswordStrengthPanel: React.FC<PasswordStrengthPanelProps> = ({ password, label, rules, pristine, mt }) => {
    const strength = evaluatePasswordStrength(password);
    const filled = Object.values(rules).filter(Boolean).length;

    const color =
        strength === "Weak" ? "fg.error" :
        strength === "Medium" ? "fg.warning" :
        strength === "Strong" ? "fg.success" : "border.default";

    return (
        <Flex mt={mt} w="full" justify="center" align="center" gap={6} wrap="wrap">
            <VStack gap={1} w={STRENGTH_COLUMN_WIDTH} flexShrink={0} color={strength ? color : "fg.muted"}>
                <ShieldCheck size={16} color="currentColor" aria-hidden="true" />
                <HStack gap={1} w="full" aria-hidden="true">
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

                <Text fontSize="xs" fontWeight="bold" color={strength ? color : "fg.muted"} textAlign="center">
                    {label}
                </Text>
            </VStack>

            <PasswordRulesChecklist rules={rules} pristine={pristine} columns={2} />
        </Flex>
    );
};

export default PasswordStrengthPanel;
