import React from "react";
import { Button, type ButtonProps } from "@chakra-ui/react";

import { FAST_HOVER_TRANSITION } from "../../theme/system";
import { TABLE_ACTION_PALETTE_STYLES } from "./tableActionPalettes";

/**
 * Per-row table action button (Edit, Policies, Delete, ...). Plain
 * variant="outline" defaults to Chakra's gray colorPalette, whose border and
 * hover fill sit right on top of this app's bg.surface/bg.canvas and a
 * striped table's alternating row color, so the button reads as plain text
 * until you already know it's clickable. These are deliberately
 * higher-contrast, fixed values instead. variant="plain" (not "outline")
 * side-steps the outline recipe's own built-in _hover, which fights with
 * any hover style set here.
 */
type TableActionButtonProps = Omit<ButtonProps, "colorPalette"> & {
    colorPalette: keyof typeof TABLE_ACTION_PALETTE_STYLES;
};

const TableActionButton: React.FC<TableActionButtonProps> = ({ colorPalette, ...rest }) => {
    const palette = TABLE_ACTION_PALETTE_STYLES[colorPalette];

    return (
        <Button
            size="xs"
            // xs's stock textStyle is 12px - a bit small for how often these
            // get read and clicked across every table. Bumped once here so
            // every row-action button gets it uniformly.
            fontSize="sm"
            variant="plain"
            borderWidth="1px"
            borderColor={palette.border}
            bg={palette.bg}
            color={palette.color}
            transition={FAST_HOVER_TRANSITION}
            _hover={{ bg: palette.hoverBg, borderColor: palette.hoverBorder, color: palette.hoverColor }}
            _dark={{
                borderColor: palette.borderDark,
                bg: palette.bgDark,
                color: palette.colorDark,
                _hover: { bg: palette.hoverBgDark, borderColor: palette.hoverBorderDark, color: palette.hoverColorDark },
            }}
            {...rest}
        />
    );
};

export default TableActionButton;
