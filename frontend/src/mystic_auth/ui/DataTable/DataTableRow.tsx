import { Box, Checkbox, Table } from "@chakra-ui/react";

import type { DataTableColumn } from "./DataTable";
import { plainTextOf } from "./DataTableStyles";
import { formatNumber } from "../../translations/numerals";
import { FAST_HOVER_TRANSITION } from "../../theme/system";
import type { SupportedLanguage } from "../../translations/translations";

// FAST_HOVER_TRANSITION minus background-color: a Chromium GPU-compositing
// bug (hardware acceleration only) left a cell's painted background stuck
// after a batched selection change (clearing many rows via the header
// checkbox), even with correct `bg`/`checked` state. Making bg/border-color
// changes instant (no transition) avoids the animated in-between state the
// bug depends on.
const CELL_TRANSITION = FAST_HOVER_TRANSITION.replace(/^background-color[^,]*,\s*/, "");

interface DataTableRowProps<T> {
    row: T;
    columns: DataTableColumn<T>[];
    selectable?: boolean;
    /** See DataTable's own prop doc: opt-in, off unless the caller
     * explicitly turns it on (e.g. a toolbar toggle). */
    rowClickSelects?: boolean;
    isSelected: boolean;
    onToggle: () => void;
    selectRowLabel: string;
    showRowNumbers: boolean;
    rowNumber?: number;
    language: SupportedLanguage;
}

/** One body <Table.Row>, split out of DataTable.tsx alongside
 * DataTableHeaderRow - see that component's own comment for why. */
export function DataTableRow<T>({
    row,
    columns,
    selectable,
    rowClickSelects,
    isSelected,
    onToggle,
    selectRowLabel,
    showRowNumbers,
    rowNumber,
    language,
}: DataTableRowProps<T>) {
    const clickToSelectActive = !!selectable && !!rowClickSelects;

    // Clicking anywhere in the row toggles it (Gmail/Linear-style), but only
    // when the caller opts in via rowClickSelects: always-on would fight a
    // user trying to select/copy cell text. Ignores clicks on an interactive
    // control inside the row (checkbox, select, action buttons) so those
    // keep their own behavior.
    const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
        if (!clickToSelectActive) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, select, [role="combobox"], [data-scope]')) return;
        onToggle();
    };

    // bg.emphasized is one step past bg.muted (the `striped` variant's own
    // alternating color), so hover reads as a deliberate further step. A
    // checked row gets brand.selected, the same token Sidebar/CommandPalette
    // use for "currently selected", not accent or a solid brand fill which
    // would fight text contrast.
    //
    // Applied to each <td> (Table.Cell), not <tr> (Table.Row): Chakra's
    // striped recipe paints its zebra background on the <td>, and a child's
    // painted background always sits on top of its parent's, so a `bg` on
    // Table.Row would only show on non-striped rows.
    const cellBg = isSelected ? "brand.selected" : undefined;
    // _groupHover (needs className="group" on the ancestor, not role="group")
    // instead of plain `_hover`: a per-cell `_hover` would only light up the
    // one <td> under the cursor, losing the whole-row hover feel.
    const cellGroupHoverBg = isSelected ? "brand.selected" : "bg.emphasized";
    // The brand color is user-customizable, so a selected row's background
    // luminance isn't knowable in advance; the plain gray border token can
    // end up too close to a dark custom brand shade, making adjacent
    // selected rows blur into one block. blackAlpha/whiteAlpha always shifts
    // darker/lighter by a fixed amount, so it stays visible against any
    // background. 600 + 2px reads as a deliberate divider, not a hairline.
    const cellBorderColor = isSelected ? { _light: "blackAlpha.600", _dark: "whiteAlpha.600" } : undefined;
    const cellBorderWidth = isSelected ? "2px" : undefined;

    return (
        <Table.Row className="group" cursor={clickToSelectActive ? "pointer" : undefined} onClick={handleRowClick}>
            {selectable && (
                <Table.Cell
                    bg={cellBg}
                    borderBottomColor={cellBorderColor}
                    borderBottomWidth={cellBorderWidth}
                    _groupHover={{ bg: cellGroupHoverBg }}
                    transition={CELL_TRANSITION}
                >
                    <Checkbox.Root checked={isSelected} onCheckedChange={onToggle} aria-label={selectRowLabel}>
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                    </Checkbox.Root>
                </Table.Cell>
            )}
            {showRowNumbers && (
                <Table.Cell
                    color="fg.muted"
                    bg={cellBg}
                    borderBottomColor={cellBorderColor}
                    borderBottomWidth={cellBorderWidth}
                    _groupHover={{ bg: cellGroupHoverBg }}
                    transition={CELL_TRANSITION}
                >
                    {formatNumber(rowNumber as number, language)}
                </Table.Cell>
            )}
            {columns.map((col) => {
                const content = col.render(row);
                return (
                    <Table.Cell
                        key={col.key}
                        textAlign={col.align}
                        overflow="hidden"
                        bg={cellBg}
                        borderBottomColor={cellBorderColor}
                        borderBottomWidth={cellBorderWidth}
                        _groupHover={{ bg: cellGroupHoverBg }}
                        transition={CELL_TRANSITION}
                    >
                        {col.truncate ? (
                            <Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={plainTextOf(content)}>
                                {content}
                            </Box>
                        ) : (
                            content
                        )}
                    </Table.Cell>
                );
            })}
        </Table.Row>
    );
}
