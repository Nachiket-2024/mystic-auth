import React from "react";
import { Skeleton, Table } from "@chakra-ui/react";

import { ariaSortFor, renderHeaderCell } from "./DataTableSortableHeader";
import { SCROLL_SHADOW_CSS } from "./DataTableStyles";
import type { DataTableColumn } from "./DataTable";
import type { SortState } from "./hooks/useSortState";

interface DataTableSkeletonProps<T> {
    columns: DataTableColumn<T>[];
    colgroup: React.ReactNode;
    showRowNumbers: boolean;
    skeletonRowCount: number;
    sort: SortState | undefined;
}

/** DataTable's isLoading state: same column headers as the real table, with
 * skeleton placeholder cells instead of rows, so the layout doesn't jump
 * once data arrives. */
function DataTableSkeleton<T>({ columns, colgroup, showRowNumbers, skeletonRowCount, sort }: DataTableSkeletonProps<T>) {
    return (
        // fontSize here (not size="md"/"lg", which only changes cell
        // padding, not text) cascades to every cell/header that doesn't
        // set its own - one bump for every table's plain text at once,
        // to match the row-action buttons' and status badges' own size.
        <Table.ScrollArea borderWidth="1px" borderColor="border.default" rounded="lg" css={SCROLL_SHADOW_CSS}>
            <Table.Root size="sm" css={{ tableLayout: "fixed", width: "100%", fontSize: "md" }}>
                {colgroup}
                <Table.Header>
                    <Table.Row>
                        {showRowNumbers && <Table.ColumnHeader w="1%" fontSize="md">#</Table.ColumnHeader>}
                        {columns.map((col) => (
                            <Table.ColumnHeader
                                key={col.key}
                                textAlign={col.align}
                                overflow="hidden"
                                fontSize="md"
                                aria-sort={ariaSortFor(col, sort)}
                            >
                                {renderHeaderCell(col, sort)}
                            </Table.ColumnHeader>
                        ))}
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
                        <Table.Row key={rowIndex}>
                            {showRowNumbers && (
                                <Table.Cell>
                                    <Skeleton height="4" />
                                </Table.Cell>
                            )}
                            {columns.map((col) => (
                                <Table.Cell key={col.key}>
                                    <Skeleton height="4" />
                                </Table.Cell>
                            ))}
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table.Root>
        </Table.ScrollArea>
    );
}

export default DataTableSkeleton;
