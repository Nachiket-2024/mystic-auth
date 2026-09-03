import React, { useMemo } from "react";
import { Portal, Select, visuallyHiddenStyle, createListCollection } from "@chakra-ui/react";

export interface ActionsMultiSelectOption {
    label: string;
    value: string;
}

interface ActionsMultiSelectProps {
    values: string[];
    onChange: (values: string[]) => void;
    options: ActionsMultiSelectOption[];
    ariaLabel: string;
    placeholder: string;
    disabled?: boolean;
}

/**
 * Multi-value counterpart to StyledSelect, used only by PolicyFormDialog's
 * `actions` field (a policy grants a list of actions, unlike every other
 * StyledSelect caller). Kept as its own component rather than adding a
 * `multiple` mode to StyledSelect, which would change `value`/`onChange`'s
 * shape for every single-select caller. Same styling as StyledSelect, just a
 * different selection model.
 */
const ActionsMultiSelect: React.FC<ActionsMultiSelectProps> = ({ values, onChange, options, ariaLabel, placeholder, disabled }) => {
    const collection = useMemo(() => createListCollection({ items: options }), [options]);

    return (
        <Select.Root
            multiple
            collection={collection}
            value={values}
            onValueChange={(details) => onChange(details.value)}
            size="md"
            disabled={disabled}
        >
            <Select.HiddenSelect aria-label={ariaLabel} />
            <Select.Label css={visuallyHiddenStyle}>{ariaLabel}</Select.Label>
            <Select.Control>
                <Select.Trigger
                    borderColor="gray.400"
                    bg="bg.surface"
                    fontSize="md"
                    minH={10}
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
                    <Select.Content
                        borderWidth="1px"
                        borderColor="border.default"
                        bg="bg.surface"
                        boxShadow="density.card"
                        rounded="density.control"
                        fontSize="md"
                        maxH="calc(7.5 * 36px)"
                        overflowY="auto"
                    >
                        {options.map((option) => (
                            <Select.Item
                                key={option.value}
                                item={option}
                                _highlighted={{ bg: "brand.solid", color: "white" }}
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

export default ActionsMultiSelect;
