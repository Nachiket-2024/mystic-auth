import React from "react";
import { Center, HStack, Text } from "@chakra-ui/react";
import { Check, Circle, X } from "lucide-react";

interface PasswordRuleItemProps {
    passed: boolean;
    label: string;
    /** See PasswordRulesChecklist's own docstring for what pristine means. */
    pristine?: boolean;
}

/** Single pass/fail row (icon + label), shared by PasswordRulesChecklist's
 * own grid and PasswordStrengthPanel's combined layout so both draw rules
 * identically. Text is left-aligned and allowed to wrap: forcing
 * `whiteSpace="nowrap"` here used to make each row take whatever width its
 * label needed regardless of the column it sat in, which pushed the row
 * wider than its container and clipped text against the card's edge in
 * narrower layouts (e.g. translated labels, or the panel's two-column
 * grid). Wrapping keeps every row inside the width its column actually has.
 *
 * The icon sits in a fixed-size `Center` rather than being sized directly:
 * the pristine dot (8px) and the check/x (14px) are different sizes, and
 * without a fixed box around them that difference changes this row's line
 * height, which shifts every field below it by a couple pixels the instant
 * the first keystroke flips pristine off. The fixed box keeps row height
 * identical in both states. `alignItems="flex-start"` plus a small top
 * offset keeps the icon pinned to the label's first line if it wraps. */
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
