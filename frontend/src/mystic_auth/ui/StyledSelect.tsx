import React, { useMemo } from "react";
import { Portal, Select, visuallyHiddenStyle, createListCollection } from "@chakra-ui/react";
import type { SelectRootProps } from "@chakra-ui/react";

export interface StyledSelectOption {
    label: string;
    value: string;
}

interface StyledSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: StyledSelectOption[];
    ariaLabel: string;
    size?: SelectRootProps["size"];
    w?: SelectRootProps["width"];
    textTransform?: SelectRootProps["textTransform"];
    disabled?: boolean;
    title?: string;
    /** Text shown in the trigger when `value` matches no option, for a
     * caller that needs a genuine "nothing chosen yet" state rather than
     * "one option IS the empty/all state." Omit for that existing pattern. */
    placeholder?: string;
}

/**
 * Filter/inline-picker dropdown shared by every select-shaped control in the
 * app. Wraps Chakra's `Select` (a styled, JS-driven listbox), not
 * `NativeSelect`: a native `<select>`'s open dropdown is always the
 * browser/OS's unstyled menu, which `Select.Content` below replaces with a
 * real styled popover.
 */
const StyledSelect: React.FC<StyledSelectProps> = ({
    value, onChange, options, ariaLabel, size = "md", w, textTransform, disabled, title, placeholder,
}) => {
    const collection = useMemo(() => createListCollection({ items: options }), [options]);

    return (
        <Select.Root
            collection={collection}
            value={[value]}
            onValueChange={(details) => onChange(details.value[0] ?? "")}
            size={size}
            width={w}
            disabled={disabled}
            title={title}
        >
            <Select.HiddenSelect aria-label={ariaLabel} />
            {/* Chakra's Select.Trigger always wires aria-labelledby to
                Select.Label's id; omitting this leaves the trigger unlabeled
                for assistive tech, since a labelledby pointing at a
                nonexistent id doesn't fall back to aria-label. Visually
                hidden since every caller already shows its own label. */}
            <Select.Label css={visuallyHiddenStyle}>{ariaLabel}</Select.Label>
            <Select.Control>
                <Select.Trigger
                    borderColor="gray.400"
                    bg="bg.surface"
                    textTransform={textTransform}
                    // Chakra's sm/md Select sizes only change height/padding
                    // (both share the same 14px textStyle); overridden to
                    // match the 15px used for table text/buttons elsewhere.
                    fontSize="md"
                    _hover={{ borderColor: "gray.600" }}
                    _focusVisible={{ borderColor: "brand.solid", boxShadow: "0 0 0 1px var(--chakra-colors-brand-solid)" }}
                    _dark={{ borderColor: "gray.600", _hover: { borderColor: "gray.400" } }}
                    transition="border-color var(--chakra-durations-hover) var(--chakra-easings-hover), box-shadow var(--chakra-durations-hover) var(--chakra-easings-hover)"
                >
                    <Select.ValueText placeholder={placeholder} />
                    <Select.IndicatorGroup>
                        <Select.Indicator />
                    </Select.IndicatorGroup>
                </Select.Trigger>
            </Select.Control>
            <Portal>
                <Select.Positioner>
                    {/* No explicit zIndex: Chakra's Select recipe already
                        computes popover + a dynamic --layer-index (same as
                        Dialog), so this stacks above a Dialog it opens from.
                        A hardcoded zIndex here used to clobber that calc and
                        render the dropdown behind its own dialog. */}
                    <Select.Content
                        borderWidth="1px"
                        borderColor="border.default"
                        bg="bg.surface"
                        // Same density.card elevation Card.tsx uses, not Chakra's
                        // stock boxShadow, so cards and popovers share one look.
                        boxShadow="density.card"
                        rounded="density.control"
                        fontSize="md"
                        // Cap by row count (~7.5 rows, matching GitHub/Linear/MUI
                        // dropdowns), not a flat rem/vh guess, so the list reads
                        // consistently regardless of option count. 36px/row =
                        // Chakra's md Select.Item py (12px) + md line-height (24px).
                        maxH="calc(7.5 * 36px)"
                        overflowY="auto"
                    >
                        {options.map((option) => (
                            <Select.Item
                                key={option.value}
                                item={option}
                                textTransform={textTransform}
                                // Three distinct states: plain at rest, solid
                                // brand fill on hover, and a tinted wash +
                                // checkmark for the selection. brand.selected,
                                // not the paler brand.subtle, so it still reads
                                // as "selected" at a glance in light mode.
                                _highlighted={{ bg: "brand.solid", color: "white" }}
                                // brand.200 in light (no `_light` condition exists,
                                // so this is the unconditioned base), brand.selected's
                                // brand.800 in dark. Nested _highlighted is needed here
                                // too, or hovering the selected row renders invisible
                                // same-color text (brand.fg == brand.solid in light).
                                _selected={{
                                    bg: "brand.200",
                                    color: "brand.fg",
                                    fontWeight: "semibold",
                                    _dark: { bg: "brand.selected" },
                                    _highlighted: { bg: "brand.solid", color: "white" },
                                }}
                            >
                                <Select.ItemText>{option.label}</Select.ItemText>
                                <Select.ItemIndicator />
                            </Select.Item>
                        ))}
                    </Select.Content>
                </Select.Positioner>
            </Portal>
        </Select.Root>
    );
};

export default StyledSelect;
