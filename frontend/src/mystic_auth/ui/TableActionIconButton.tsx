import React from "react";
import { IconButton, Tooltip, type IconButtonProps } from "@chakra-ui/react";

import { FAST_HOVER_TRANSITION } from "../theme/system";
import { TABLE_ACTION_PALETTE_STYLES } from "./tableActionPalettes";

type TableActionIconButtonProps = Omit<IconButtonProps, "colorPalette" | "aria-label"> & {
    colorPalette: keyof typeof TABLE_ACTION_PALETTE_STYLES;
    /** Used as both the button's aria-label and its hover/focus tooltip text,
     * so a row of icon-only actions stays identifiable to screen-reader and
     * sighted users alike without needing a visible text label. */
    label: string;
};

/**
 * Icon-only counterpart to TableActionButton, for rows where several actions
 * (View/Policies/Reactivate/Purge) must always stay on one line regardless
 * of locale - translated labels vary too widely in width (e.g. "Purge" vs.
 * "स्थायी रूप से हटाएं") for text buttons to guarantee that. Reuses the same
 * palette styling so icon and text row-actions read as the same design
 * language elsewhere in the app.
 */
const TableActionIconButton: React.FC<TableActionIconButtonProps> = ({ colorPalette, label, ...rest }) => {
    const palette = TABLE_ACTION_PALETTE_STYLES[colorPalette];

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
                <Tooltip.Content>{label}</Tooltip.Content>
            </Tooltip.Positioner>
        </Tooltip.Root>
    );
};

export default TableActionIconButton;
