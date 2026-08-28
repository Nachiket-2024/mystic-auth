/** Same shape as React's `Dispatch<SetStateAction<T>>`: accepts a plain
 * value or an updater keyed off the current state at apply time, not the
 * render-time `selectedKeys` closure. See toggleRow/toggleAll below. */
export type SelectionChangeHandler = (
    update: Set<string | number> | ((prev: ReadonlySet<string | number>) => Set<string | number>)
) => void;

/**
 * Row-selection bookkeeping shared by DataTable's checkbox column and
 * "N selected / Clear selection" bar. This hook owns no state of its own;
 * `selectedKeys`/`onSelectionChange` come from the caller, so selection
 * survives a page/filter change exactly as the caller decides.
 */
export function useDataTableSelection<T>({
    rows,
    rowKey,
    selectedKeys,
    onSelectionChange,
}: {
    rows: T[] | undefined;
    rowKey: (row: T) => string | number;
    selectedKeys: ReadonlySet<string | number> | undefined;
    onSelectionChange: SelectionChangeHandler | undefined;
}) {
    // "Select all" only covers rows actually rendered now (this page,
    // this filter), never rows the caller hasn't loaded.
    const allKeysOnScreen = rows?.map(rowKey) ?? [];
    const selectedOnScreenCount = allKeysOnScreen.filter((k) => selectedKeys?.has(k)).length;
    const isAllSelected = allKeysOnScreen.length > 0 && selectedOnScreenCount === allKeysOnScreen.length;
    const isSomeSelected = selectedOnScreenCount > 0 && !isAllSelected;

    // toggleRow/toggleAll/clearSelection all use the functional form of
    // onSelectionChange, computing `next` from `prev` at commit time, not
    // the render-time `selectedKeys` prop. Several selection clicks fired in
    // quick succession could otherwise apply out of order, with a stale
    // handler overwriting a newer one and resurrecting a cleared selection.
    const toggleRow = (key: string | number) => {
        onSelectionChange?.((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleAll = () => {
        onSelectionChange?.((prev) => {
            const next = new Set(prev);
            // Recomputed off `prev`, not the display-only `isAllSelected`
            // above, for the same staleness reason as toggleRow.
            const allSelected = allKeysOnScreen.length > 0 && allKeysOnScreen.every((k) => prev.has(k));
            if (allSelected) allKeysOnScreen.forEach((k) => next.delete(k));
            else allKeysOnScreen.forEach((k) => next.add(k));
            return next;
        });
    };

    const clearSelection = () => {
        onSelectionChange?.((prev) => {
            const next = new Set(prev);
            allKeysOnScreen.forEach((k) => next.delete(k));
            return next;
        });
    };

    return {
        allKeysOnScreen,
        selectedOnScreenCount,
        isAllSelected,
        isSomeSelected,
        toggleRow,
        toggleAll,
        clearSelection,
    };
}
