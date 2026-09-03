import React from "react";
import { Table, EmptyState } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import FormAlert from "../FormAlert";
import { DataTableHeaderRow } from "./DataTableSortableHeader";
import { DataTableRow } from "./DataTableRow";
import DataTableSkeleton from "./DataTableSkeleton";
import { useDataTableSelection, type SelectionChangeHandler } from "./DataTableSelection";
import { SCROLL_AREA_SCROLLBAR_CSS, SCROLL_SHADOW_CSS } from "./DataTableStyles";
import type { SortState } from "../hooks/useSortState";
import { useLanguageStore } from "../../store/languageStore";

export interface DataTableColumn<T> {
    key: string;
    header: string;
    render: (row: T) => React.ReactNode;
    /** Right-aligns numeric/action columns. */
    align?: "start" | "center" | "end";
    /** Whether clicking this column's header sorts by it (see `sort`/
     * `onSortChange` below). `key` doubles as the sort key sent to the
     * backend - every current caller's column keys already match the
     * backend's own allowlisted sortable column names 1:1. */
    sortable?: boolean;
    /** Fixed width (e.g. "10rem"), applied via <colgroup> below with
     * `table-layout: fixed`. Without this, a plain HTML table sizes each
     * column from its own current cell contents, so switching filters/tabs
     * reflows every column width on every render. Give a fixed width to any
     * column whose content varies a lot in length; columns left unset share
     * the remaining space evenly - AS LONG AS every column in the table is
     * either unset or a percentage. Mixing an unset column with this
     * table's own rem-sized columns doesn't reliably share leftover space:
     * once the rem-sized columns alone exceed the container's width, the
     * unset column can get squeezed to a few illegible px instead of the
     * table properly overflowing into Table.ScrollArea's horizontal scroll.
     * Give every column in a table that has ANY rem-sized column a rem
     * width too, so a too-narrow viewport scrolls the whole table instead
     * of silently truncating just that one column. */
    width?: string;
    /** Clips this column's content to one line with a trailing ellipsis
     * instead of overflowing into the next column - for a long unbroken
     * string (an email, a UA string) with nowhere to wrap once its column
     * has a fixed width. Set this on free-form text columns; leave it off
     * for columns that already manage their own overflow (badges/buttons
     * meant to wrap). When `render` returns a plain string, it's also used
     * as the cell's `title` so the full value is available on hover. */
    truncate?: boolean;
}

interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    rows: T[] | undefined;
    rowKey: (row: T) => string | number;
    isLoading?: boolean;
    isError?: boolean;
    errorMessage?: string;
    emptyMessage?: string;
    /** Icon shown above `emptyMessage` in the empty state (e.g. a lucide-react
     * icon element). Omit for a bare title, same as before this prop existed. */
    emptyIcon?: React.ReactNode;
    /** Action rendered below `emptyMessage`, for empty states with an obvious
     * next step (e.g. a "Create Policy" button when a management list has
     * zero rows and no filter is narrowing it). Omit for a dead-end message. */
    emptyAction?: React.ReactNode;
    /** Rows of skeleton placeholders shown while isLoading, mirrors the
     * shape of the real table rather than swapping to a spinner, so the
     * layout doesn't jump once data arrives. */
    skeletonRowCount?: number;
    /** Current sort column/direction, if any column is `sortable`. Omit
     * entirely for a table with no sortable columns. */
    sort?: SortState;
    /** Called with a column's `key` when its (sortable) header is clicked.
     * Required if any column sets `sortable`. */
    onSortChange?: (key: string) => void;
    /** When set, prepends a numbered "#" column so rows are easy to track
     * by position - `startIndex + 1` for the first rendered row. Pass the
     * page offset (e.g. `(page - 1) * PAGE_SIZE`) for a server-paginated
     * table so numbers reflect the row's real position, not just its
     * position on the current page; pass `0` for an unpaginated table. Omit
     * for a table where row position isn't meaningful. */
    startIndex?: number;
    /** Prepends a checkbox column (per-row + a header "select all" covering
     * every rendered row) and a selected-count indicator above the table.
     * This only adds the selection UI itself; wiring the resulting keys up
     * to a bulk action is the caller's job. Requires
     * `selectedKeys`/`onSelectionChange` below; omit all three for a plain,
     * non-selectable table. */
    selectable?: boolean;
    /** Currently-selected row keys (same key space as `rowKey`), owned by
     * the caller so selection can survive a page/filter change if the
     * caller wants that, or be cleared on one if it doesn't. */
    selectedKeys?: ReadonlySet<string | number>;
    /** Called on every checkbox toggle (row or select-all), always with the
     * FUNCTIONAL form (same shape as React's `Dispatch<SetStateAction>`) -
     * `(prev) => next`, computed off the true latest selection when the
     * update applies, never a render/click-time snapshot. Passing a plain
     * `useState` setter directly satisfies this automatically, and is also
     * what makes this safe under several rapid selection changes fired in
     * quick succession (see DataTableSelection.ts for why a value-only
     * version could silently resurrect a just-cleared row). */
    onSelectionChange?: SelectionChangeHandler;
    /** Opt-in: while true (and `selectable`), clicking anywhere in a row
     * (except an interactive control inside it) toggles that row's
     * selection, not just its checkbox. Defaults to off so a table stays
     * normal-click-to-select-text elsewhere - always-on would fight a user
     * trying to double-click/drag-select cell text to copy it. */
    rowClickSelects?: boolean;
}

/**
 * Generic table with a shared loading/error/empty treatment, so every
 * management list page (Users, Policies, Audit Log) doesn't reimplement the
 * same three conditional branches around a bare Chakra Table. Selection
 * bookkeeping lives in DataTableSelection.ts, the loading skeleton in
 * DataTableSkeleton.tsx, and shared style constants in DataTableStyles.ts -
 * this file owns only the loaded-state render.
 */
function DataTable<T>({
    columns,
    rows,
    rowKey,
    isLoading,
    isError,
    errorMessage,
    emptyMessage,
    emptyIcon,
    emptyAction,
    skeletonRowCount = 5,
    sort,
    onSortChange,
    startIndex,
    selectable,
    selectedKeys,
    onSelectionChange,
    rowClickSelects,
}: DataTableProps<T>) {
    const { t } = useTranslation("ui_text");
    // chromeLanguage, not pageLanguage: numerals stay ASCII even in a mixed
    // "en+hi" mode, same as dates (dateFormat.ts).
    const language = useLanguageStore((s) => s.chromeLanguage);
    const showRowNumbers = startIndex !== undefined;

    const { isAllSelected, isSomeSelected, toggleRow, toggleAll } =
        useDataTableSelection({ rows, rowKey, selectedKeys, onSelectionChange });

    const colgroup = (
        <colgroup>
            {selectable && <col style={{ width: "2.75rem" }} />}
            {showRowNumbers && <col style={{ width: "3rem" }} />}
            {columns.map((col) => (
                <col key={col.key} style={col.width ? { width: col.width } : undefined} />
            ))}
        </colgroup>
    );

    if (isLoading) {
        return (
            <DataTableSkeleton
                columns={columns}
                colgroup={colgroup}
                showRowNumbers={showRowNumbers}
                skeletonRowCount={skeletonRowCount}
                sort={sort}
            />
        );
    }

    if (isError) {
        return <FormAlert status="error">{errorMessage ?? t("failedToLoadData")}</FormAlert>;
    }

    if (!rows || rows.length === 0) {
        return (
            <EmptyState.Root size="md">
                <EmptyState.Content>
                    {emptyIcon && (
                        // A bare icon glyph on its own reads as thin at this
                        // size - a soft accent-tinted circle behind it gives
                        // the empty state visual weight, matching
                        // DashboardPage's own icon-in-a-circle treatment.
                        <EmptyState.Indicator
                            bg="accent.subtle"
                            color="accent.fg"
                            borderWidth="1px"
                            borderColor="accent.border"
                            rounded="full"
                            boxSize="16"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                        >
                            {emptyIcon}
                        </EmptyState.Indicator>
                    )}
                    <EmptyState.Title>{emptyMessage ?? t("noDataAvailable")}</EmptyState.Title>
                    {emptyAction}
                </EmptyState.Content>
            </EmptyState.Root>
        );
    }

    return (
        <>
            {/* maxH caps this table's height once it has enough rows to exceed
                it, turning Table.ScrollArea into a real vertical scroll
                container too - which is what makes the sticky header cells
                below actually stick to something. A table with fewer rows
                than fit in 70dvh never hits this cap. */}
            <Table.ScrollArea
                borderWidth="1px"
                borderColor="border.default"
                rounded="lg"
                maxH="70dvh"
                css={{ ...SCROLL_SHADOW_CSS, ...SCROLL_AREA_SCROLLBAR_CSS }}
            >
            <Table.Root
                size="sm"
                striped
                css={{
                    tableLayout: "fixed",
                    width: "100%",
                    fontSize: "md",
                    // The last row's own borderBottomWidth stacked directly
                    // on top of Table.ScrollArea's outer border, reading as
                    // a doubled line at the bottom edge - drop just that
                    // row's bottom border since the ScrollArea's own border
                    // already closes the box off there.
                    "& tbody tr:last-of-type td": { borderBottomWidth: 0 },
                }}
            >
                {colgroup}
                <Table.Header>
                    <DataTableHeaderRow
                        columns={columns}
                        sort={sort}
                        onSortChange={onSortChange}
                        selectable={selectable}
                        showRowNumbers={showRowNumbers}
                        isAllSelected={isAllSelected}
                        isSomeSelected={isSomeSelected}
                        onToggleAll={toggleAll}
                        selectAllLabel={t("selectAllRows")}
                    />
                </Table.Header>
                <Table.Body>
                    {rows.map((row, rowIndex) => (
                        <DataTableRow
                            key={rowKey(row)}
                            row={row}
                            columns={columns}
                            selectable={selectable}
                            rowClickSelects={rowClickSelects}
                            isSelected={selectedKeys?.has(rowKey(row)) ?? false}
                            onToggle={() => toggleRow(rowKey(row))}
                            selectRowLabel={t("selectRow")}
                            showRowNumbers={showRowNumbers}
                            rowNumber={showRowNumbers ? (startIndex as number) + rowIndex + 1 : undefined}
                            language={language}
                        />
                    ))}
                </Table.Body>
            </Table.Root>
            </Table.ScrollArea>
        </>
    );
}

export default DataTable;
