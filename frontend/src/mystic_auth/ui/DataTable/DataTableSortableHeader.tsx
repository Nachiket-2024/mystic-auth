import { Checkbox, Box, Table } from "@chakra-ui/react";

import type { DataTableColumn } from "./DataTable";
import type { SortState } from "../hooks/useSortState";
import { STICKY_HEADER_CELL_PROPS } from "./DataTableStyles";
import { ariaSortFor, renderHeaderCell } from "./DataTableSortIndicator";

interface DataTableHeaderRowProps<T> {
    columns: DataTableColumn<T>[];
    sort?: SortState;
    onSortChange?: (key: string) => void;
    selectable?: boolean;
    showRowNumbers: boolean;
    isAllSelected: boolean;
    isSomeSelected: boolean;
    onToggleAll: () => void;
    selectAllLabel: string;
}

/** The full header <Table.Row>, split out of DataTable.tsx so that file's
 * own render stays under the repo's file-length guideline - this owns only
 * the header cells, DataTableRow owns a body row, DataTable.tsx wires both
 * up to the shared column/selection state. */
export function DataTableHeaderRow<T>({
    columns,
    sort,
    onSortChange,
    selectable,
    showRowNumbers,
    isAllSelected,
    isSomeSelected,
    onToggleAll,
    selectAllLabel,
}: DataTableHeaderRowProps<T>) {
    return (
        <Table.Row>
            {selectable && (
                <Table.ColumnHeader w="1%" {...STICKY_HEADER_CELL_PROPS}>
                    <Checkbox.Root
                        checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                        onCheckedChange={onToggleAll}
                        aria-label={selectAllLabel}
                    >
                        <Checkbox.HiddenInput />
                        <Checkbox.Control />
                    </Checkbox.Root>
                </Table.ColumnHeader>
            )}
            {showRowNumbers && (
                <Table.ColumnHeader w="1%" fontSize="md" {...STICKY_HEADER_CELL_PROPS}>#</Table.ColumnHeader>
            )}
            {columns.map((col) => (
                <Table.ColumnHeader
                    key={col.key}
                    textAlign={col.align}
                    overflow="hidden"
                    fontSize="md"
                    aria-sort={ariaSortFor(col, sort)}
                    {...STICKY_HEADER_CELL_PROPS}
                    onClick={col.sortable ? () => onSortChange?.(col.key) : undefined}
                    onKeyDown={
                        col.sortable
                            ? (e) => {
                                  // SortableHeaderLabel renders role="button", but the
                                  // click handler lives here on the parent cell - a
                                  // span[role=button] (unlike a real <button>) doesn't
                                  // fire on Enter/Space by itself, so without this the
                                  // header is focusable but not actually operable via
                                  // keyboard.
                                  if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      onSortChange?.(col.key);
                                  }
                              }
                            : undefined
                    }
                >
                    {col.truncate ? (
                        <Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={col.header}>
                            {renderHeaderCell(col, sort)}
                        </Box>
                    ) : (
                        renderHeaderCell(col, sort)
                    )}
                </Table.ColumnHeader>
            ))}
        </Table.Row>
    );
}
