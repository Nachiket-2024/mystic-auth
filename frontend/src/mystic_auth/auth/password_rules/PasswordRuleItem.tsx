import React from "react";
import { Center, HStack, Text } from "@chakra-ui/react";
import { Check, Circle, X } from "lucide-react";

interface PasswordRuleItemProps {
    passed: boolean;
    label: string;
    /** See PasswordRulesChecklist's own docstring for what pristine means. */
    pristine?: boolean;
}

/** Single pass/fail row (icon + label), shared by PasswordRulesChecklist's grid and
 * PasswordStrengthPanel's layout so both draw rules identically. Text wraps instead of
 * using `whiteSpace="nowrap"`, which used to overflow the row past its column on
 * translated (longer) labels.
 *
 * The icon sits in a fixed-size `Center` because the pristine dot (8px) and the
 * check/x (14px) are different sizes; without the fixed box, that size difference
 * shifts row height (and everything below it) the instant the first keystroke flips
 * pristine off. `alignItems="flex-start"` plus a small top offset keeps the icon
 * pinned to the label's first line if it wraps. */
const PasswordRuleItem: React.FC<PasswordRuleItemProps> = ({ passed, label, pristine = false }) => (
    <HStack gap={1} align="flex-start" color={pristine ? "fg.muted" : passed ? "fg.success" : "fg.error"}>
        <Center boxSize="14px" flexShrink={0} mt="2px">
            {pristine ? (
                <Circle size={8} fill="currentColor" aria-hidden="true" />
            ) : passed ? (
                <Check size={14} aria-hidden="true" />
            ) : (
                <X size={14} aria-hidden="true" />
            )}
        </Center>
        <Text as="span" textAlign="left">{label}</Text>
    </HStack>
);

export default PasswordRuleItem;
