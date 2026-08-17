import React from "react";
import { Box, Checkbox, HStack, Table, Text, EmptyState } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import FormAlert from "./FormAlert";
import { ariaSortFor, renderHeaderCell } from "./DataTableSortableHeader";
import DataTableSkeleton from "./DataTableSkeleton";
import { useDataTableSelection } from "./DataTableSelection";
import { plainTextOf, STICKY_HEADER_CELL_PROPS } from "./DataTableStyles";
import type { SortState } from "./hooks/useSortState";
import { useLanguageStore } from "../store/languageStore";
import { formatNumber } from "../translations/numerals";
import { FAST_HOVER_TRANSITION } from "../theme/system";

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
     * (a shorter name, an empty IP, a different badge set) reflows every
     * column width on every render - distracting movement that has nothing
     * to do with the data itself. Give a fixed width to any column whose
     * content varies a lot in length; columns left unset share the
     * remaining space evenly - AS LONG AS every column in the table is
     * either unset or a percentage. Mixing an unset/percentage column with
     * this table's OWN rem-sized columns doesn't reliably share leftover
     * space under `table-layout: fixed`: once the rem-sized columns alone
     * exceed the container's width (e.g. several action/status columns on
     * a 1024px-wide viewport), the unset column can get squeezed to a few
     * illegible px instead of the table properly overflowing into
     * Table.ScrollArea's horizontal scroll. Give every column in a table
     * that has ANY rem-sized column a rem width too, so the total is
     * deterministic and a too-narrow viewport scrolls the whole table
     * instead of silently truncating just that one column (see
     * usersColumns.tsx's Name/Email and PoliciesPage.tsx's actions_list for
     * the fix applied after finding this the hard way). */
    width?: string;
    /** Clips this column's content to one line with a trailing ellipsis
     * instead of letting it overflow into the next column - the fix for a
     * long unbroken string (an email, a UA string, an audit "action" id)
     * that has nowhere to wrap once its column has a fixed width. Set this
     * on any column whose content is free-form text of unpredictable
     * length; leave it off for columns that already manage their own
     * overflow (badges/buttons in an HStack/Wrap that's meant to wrap onto
     * a second line). When `render` returns a plain string, that string is
     * also used as the cell's `title` so the full value is still available
     * on hover. */
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
     * table so numbers reflect the row's real position across the whole
     * result set, not just its position on the current page; pass `0` for
     * an unpaginated/client-filtered table. Omit entirely for a table where
     * row position isn't meaningful (e.g. one already keyed by a visible
     * id/name column). */
    startIndex?: number;
    /** Prepends a checkbox column (per-row + a header "select all" that
     * covers every currently-rendered row) and a selected-count indicator
     * above the table. This only adds the selection UI itself - it's the
     * caller's job to wire the resulting keys up to an actual bulk action
     * (or not: a table can be selectable purely so a caller can read off
     * `onSelectionChange` without offering any bulk button yet). Requires
     * `selectedKeys`/`onSelectionChange` below; omit all three for a plain,
     * non-selectable table, same as before this prop existed. */
    selectable?: boolean;
    /** Currently-selected row keys (same key space as `rowKey`), owned by
     * the caller so selection can survive a page/filter change if the
     * caller wants that, or be cleared on one if it doesn't. */
    selectedKeys?: ReadonlySet<string | number>;
    /** Called with the full next selection set on every checkbox toggle
     * (row or select-all) - never just the changed key - so the caller can
     * treat it as the new source of truth without diffing it themselves. */
    onSelectionChange?: (keys: Set<string | number>) => void;
}

/**
 * Generic table with a shared loading/error/empty treatment, so every
 * management list page (Users, Policies, Audit Log) doesn't reimplement the same three
 * conditional branches around a bare Chakra Table. Selection bookkeeping
 * lives in DataTableSelection.ts, the loading skeleton in
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
}: DataTableProps<T>) {
    const { t } = useTranslation("ui_text");
    // chromeLanguage, not pageLanguage: numerals stay in English/ASCII digits
    // even in a mixed "en+hi" mode, the same way dates already do (see
    // dateFormat.ts's callers) - only translated text switches with pageLanguage.
    const language = useLanguageStore((s) => s.chromeLanguage);
    const showRowNumbers = startIndex !== undefined;

    const { selectedOnScreenCount, isAllSelected, isSomeSelected, toggleRow, toggleAll, clearSelection } =
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
                        // A bare icon glyph on its own reads as thin/
                        // accidental at this size - a soft accent-tinted
                        // circle behind it gives the empty state some visual
                        // weight, matching the treatment DashboardPage's own
                        // identity avatar already uses for its icon-in-a-
                        // circle.
                        <EmptyState.Indicator
                            bg="accent.subtle"
                            color="accent.fg"
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
            {selectable && selectedOnScreenCount > 0 && (
                <HStack justify="space-between" mb={2} px={1}>
                    <Text fontSize="sm" color="fg.muted">
                        {t("selectedCount", { count: selectedOnScreenCount })}
                    </Text>
                    <Text as="button" fontSize="sm" color="brand.fg" fontWeight="medium" onClick={clearSelection}>
                        {t("clearSelection")}
                    </Text>
                </HStack>
            )}
            {/* maxH caps this table's own height once it has enough rows to
                exceed it, turning Table.ScrollArea (already overflow:auto on
                both axes, for the horizontal scroll-shadow above) into a real
                vertical scroll container too - which is what makes the sticky
                header cells below actually stick to something instead of the
                whole page scrolling past a header that "sticks" to nothing. A
                table with fewer rows than fit in 70dvh never hits this cap, so
                it renders exactly as before (no inner scrollbar, no clipping). */}
            <Table.ScrollArea borderWidth="1px" borderColor="border.default" rounded="lg" maxH="70dvh">
            <Table.Root size="sm" striped css={{ tableLayout: "fixed", width: "100%", fontSize: "md" }}>
                {colgroup}
                <Table.Header>
                    <Table.Row>
                        {selectable && (
                            <Table.ColumnHeader w="1%" {...STICKY_HEADER_CELL_PROPS}>
                                <Checkbox.Root
                                    checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                                    onCheckedChange={toggleAll}
                                    aria-label={t("selectAllRows")}
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
                                    <Box
                                        overflow="hidden"
                                        textOverflow="ellipsis"
                                        whiteSpace="nowrap"
                                        title={col.header}
                                    >
                                        {renderHeaderCell(col, sort)}
                                    </Box>
                                ) : (
                                    renderHeaderCell(col, sort)
                                )}
                            </Table.ColumnHeader>
                        ))}
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {rows.map((row, rowIndex) => (
                        // bg.emphasized (Chakra's own default for that token) is
                        // exactly one step past bg.muted, which is what the
                        // `striped` variant above already uses for its own
                        // alternating row background - so hover reads as a
                        // deliberate further step, not a color unrelated to the
                        // stripe underneath it.
                        <Table.Row key={rowKey(row)} _hover={{ bg: "bg.emphasized" }} transition={FAST_HOVER_TRANSITION}>
                            {selectable && (
                                <Table.Cell>
                                    <Checkbox.Root
                                        checked={selectedKeys?.has(rowKey(row)) ?? false}
                                        onCheckedChange={() => toggleRow(rowKey(row))}
                                        aria-label={t("selectRow")}
                                    >
                                        <Checkbox.HiddenInput />
                                        <Checkbox.Control />
                                    </Checkbox.Root>
                                </Table.Cell>
                            )}
                            {showRowNumbers && (
                                <Table.Cell color="fg.muted">{formatNumber((startIndex as number) + rowIndex + 1, language)}</Table.Cell>
                            )}
                            {columns.map((col) => {
                                const content = col.render(row);
                                return (
                                    <Table.Cell key={col.key} textAlign={col.align} overflow="hidden">
                                        {col.truncate ? (
                                            <Box
                                                overflow="hidden"
                                                textOverflow="ellipsis"
                                                whiteSpace="nowrap"
                                                title={plainTextOf(content)}
                                            >
                                                {content}
                                            </Box>
                                        ) : (
                                            content
                                        )}
                                    </Table.Cell>
                                );
                            })}
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table.Root>
            </Table.ScrollArea>
        </>
    );
}

export default DataTable;
