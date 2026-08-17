/**
 * Row-selection bookkeeping shared by DataTable's checkbox column and
 * "N selected / Clear selection" bar. Pulled out of DataTable.tsx itself so
 * that file stays focused on rendering; this hook owns none of its own
 * state - `selectedKeys`/`onSelectionChange` still come from the caller (see
 * DataTable.tsx's own docstring on why: selection needs to survive a
 * page/filter change exactly as the caller decides).
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
    onSelectionChange: ((keys: Set<string | number>) => void) | undefined;
}) {
    // "Select all" only ever covers the rows actually rendered right now
    // (this page, this filter) - it has no way to reach rows the caller
    // hasn't loaded, so it never silently selects more than what's on
    // screen.
    const allKeysOnScreen = rows?.map(rowKey) ?? [];
    const selectedOnScreenCount = allKeysOnScreen.filter((k) => selectedKeys?.has(k)).length;
    const isAllSelected = allKeysOnScreen.length > 0 && selectedOnScreenCount === allKeysOnScreen.length;
    const isSomeSelected = selectedOnScreenCount > 0 && !isAllSelected;

    const toggleRow = (key: string | number) => {
        const next = new Set(selectedKeys);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onSelectionChange?.(next);
    };

    const toggleAll = () => {
        const next = new Set(selectedKeys);
        if (isAllSelected) allKeysOnScreen.forEach((k) => next.delete(k));
        else allKeysOnScreen.forEach((k) => next.add(k));
        onSelectionChange?.(next);
    };

    const clearSelection = () => {
        const next = new Set(selectedKeys);
        allKeysOnScreen.forEach((k) => next.delete(k));
        onSelectionChange?.(next);
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
