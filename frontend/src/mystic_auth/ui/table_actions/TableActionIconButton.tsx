import React from "react";
import { IconButton, Tooltip, type IconButtonProps } from "@chakra-ui/react";

import { FAST_HOVER_TRANSITION } from "../../theme/system";
import { TABLE_ACTION_PALETTE_STYLES } from "./tableActionPalettes";

type TableActionIconButtonProps = Omit<IconButtonProps, "colorPalette" | "aria-label"> & {
    colorPalette: keyof typeof TABLE_ACTION_PALETTE_STYLES;
    /** Used as both the button's aria-label and its hover/focus tooltip text,
     * so a row of icon-only actions stays identifiable to screen-reader and
     * sighted users alike without needing a visible text label. */
    label: string;
    /** Overrides the tooltip text while `disabled` is true, e.g. "The
     * reserved system account cannot be modified" instead of the plain
     * action name - so a disabled action explains itself on hover/focus
     * instead of silently doing nothing. Deliberately does NOT change the
     * button's aria-label: callers (e.g. UsersPage's row actions) select
     * these by their stable accessible name across every row regardless of
     * disabled state, and screen-reader users already hear "dimmed"/
     * "disabled" from the native disabled attribute itself. Ignored while
     * enabled. */
    disabledLabel?: string;
};

/**
 * Icon-only counterpart to TableActionButton, for rows where several actions
 * (View/Policies/Reactivate/Purge) must always stay on one line regardless
 * of locale - translated labels vary too widely in width (e.g. "Purge" vs.
 * "स्थायी रूप से हटाएं") for text buttons to guarantee that. Reuses the same
 * palette styling so icon and text row-actions read as the same design
 * language elsewhere in the app.
 */
const TableActionIconButton: React.FC<TableActionIconButtonProps> = ({ colorPalette, label, disabledLabel, ...rest }) => {
    const palette = TABLE_ACTION_PALETTE_STYLES[colorPalette];
    // Read (without removing) `disabled` off `rest` so it still flows to
    // IconButton exactly the same way it always did (a single `...rest`
    // spread, order unchanged).
    const tooltipText = rest.disabled && disabledLabel ? disabledLabel : label;

    return (
        <Tooltip.Root openDelay={300} closeDelay={100}>
            <Tooltip.Trigger asChild>
                <IconButton
                    size="xs"
                    variant="plain"
                    borderWidth="1px"
                    borderColor={palette.border}
                    bg={palette.bg}
                    color={palette.color}
                    aria-label={label}
                    transition={FAST_HOVER_TRANSITION}
                    _hover={{ bg: palette.hoverBg, borderColor: palette.hoverBorder, color: palette.hoverColor }}
                    _dark={{
                        borderColor: palette.borderDark,
                        bg: palette.bgDark,
                        color: palette.colorDark,
                        _hover: {
                            bg: palette.hoverBgDark,
                            borderColor: palette.hoverBorderDark,
                            color: palette.hoverColorDark,
                        },
                    }}
                    {...rest}
                />
            </Tooltip.Trigger>
            <Tooltip.Positioner>
                <Tooltip.Content>{tooltipText}</Tooltip.Content>
            </Tooltip.Positioner>
        </Tooltip.Root>
    );
};

export default TableActionIconButton;
