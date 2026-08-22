import { Box, Checkbox, Table } from "@chakra-ui/react";

import type { DataTableColumn } from "./DataTable";
import { plainTextOf } from "./DataTableStyles";
import { formatNumber } from "../../translations/numerals";
import { FAST_HOVER_TRANSITION } from "../../theme/system";
import type { SupportedLanguage } from "../../translations/translations";

interface DataTableRowProps<T> {
    row: T;
    columns: DataTableColumn<T>[];
    selectable?: boolean;
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
    isSelected,
    onToggle,
    selectRowLabel,
    showRowNumbers,
    rowNumber,
    language,
}: DataTableRowProps<T>) {
    return (
        // bg.emphasized (Chakra's own default for that token) is exactly one
        // step past bg.muted, which is what the `striped` variant already
        // uses for its own alternating row background - so hover reads as a
        // deliberate further step, not a color unrelated to the stripe
        // underneath it.
        <Table.Row _hover={{ bg: "bg.emphasized" }} transition={FAST_HOVER_TRANSITION}>
            {selectable && (
                <Table.Cell>
                    <Checkbox.Root checked={isSelected} onCheckedChange={onToggle} aria-label={selectRowLabel}>
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                    </Checkbox.Root>
                </Table.Cell>
            )}
            {showRowNumbers && <Table.Cell color="fg.muted">{formatNumber(rowNumber as number, language)}</Table.Cell>}
            {columns.map((col) => {
                const content = col.render(row);
                return (
                    <Table.Cell key={col.key} textAlign={col.align} overflow="hidden">
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
