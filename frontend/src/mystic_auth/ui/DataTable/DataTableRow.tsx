import type React from "react";
import { ChevronRight } from "lucide-react";

import { Checkbox } from "../shadcn/checkbox";
import { TableCell, TableRow } from "../shadcn/table";
import { cn } from "../styles/classNames";
import AppTooltip from "../feedback/AppTooltip";
import type { DataTableColumn } from "./DataTable";
import { plainTextOf } from "./DataTableStyles";
import { formatNumber } from "../../translations/numerals";
import type { SupportedLanguage } from "../../translations/translations";

// Only border-color transitions, not background-color: a Chromium
// GPU-compositing bug left a cell's painted background stuck after a
// batched selection change (clearing many rows via the header checkbox),
// even with correct bg/checked state. Making background changes instant
// avoids the animated in-between state the bug depends on.
const CELL_TRANSITION = "transition-[border-color] duration-[var(--duration-fast)] ease-[var(--easing-hover)]";

const ALIGN_CLASS = { start: "text-left", center: "text-center", end: "text-right" } as const;

interface DataTableRowProps<T> {
    row: T;
    columns: DataTableColumn<T>[];
    selectable?: boolean;
    /** See DataTable's `disabledKeys` prop doc: this row's checkbox renders
     * disabled and unchecked, and row-click-select is a no-op on it. */
    disabled?: boolean;
    /** See DataTable's prop doc: opt-in, off unless the caller explicitly
     * turns it on (e.g. a toolbar toggle). */
    rowClickSelects?: boolean;
    isSelected: boolean;
    onToggle: () => void;
    selectRowLabel: string;
    showRowNumbers: boolean;
    rowNumber?: number;
    language: SupportedLanguage;
    /** See DataTable's onRowClick/activeRowKey docs. */
    onRowClick?: () => void;
    isActive?: boolean;
    rowClassName?: string;
}

/** One body <tr>, split out of DataTable.tsx alongside DataTableHeaderRow -
 * see that component's comment for why. */
export function DataTableRow<T>({
    row,
    columns,
    selectable,
    disabled,
    rowClickSelects,
    isSelected,
    onToggle,
    selectRowLabel,
    showRowNumbers,
    rowNumber,
    language,
    onRowClick,
    isActive,
    rowClassName,
}: DataTableRowProps<T>) {
    const clickToSelectActive = !!selectable && !!rowClickSelects && !disabled;

    const isInteractiveTarget = (target: HTMLElement) =>
        !!target.closest('button, a, input, select, [role="combobox"], [data-scope]:not([data-scope="tooltip"])');

    // Clicking anywhere in the row toggles it (Gmail/Linear-style), but only
    // when the caller opts in via rowClickSelects: always-on would fight a
    // user trying to select/copy cell text. Ignores clicks on an interactive
    // control inside the row (checkbox, select, action buttons) so those
    // keep their own behavior. `[data-scope]` excludes `:not([data-scope="tooltip"])`:
    // a truncated cell's AppTooltip wraps its text in a Tooltip.Trigger,
    // which Radix also tags with data-scope - that trigger isn't
    // interactive, so without the exclusion clicking truncated text (e.g.
    // the email column) silently failed to select the row.
    const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
        if (!clickToSelectActive && !onRowClick) return;
        const target = e.target as HTMLElement;
        if (isInteractiveTarget(target)) return;
        if (clickToSelectActive) onToggle();
        else onRowClick?.();
    };

    const handleRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
        if (!onRowClick || isInteractiveTarget(e.target as HTMLElement)) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onRowClick();
    };

    // bg-row-hover is a translucent brand tint (color-mix over brand-solid), not
    // a flat gray, so the selectable column's unchecked checkbox border
    // (border-strong) does not blend into a hovered row. It is also distinct
    // from the sticky header background (DataTableStyles.ts). A checked row uses
    // bg-brand-selected, the token Sidebar/CommandPalette use for "selected".
    //
    // Applied to each <td>, not <tr>: a child's background paints over its
    // parent's, so a row background would not show through cell content.
    const cellBgClass = isSelected || isActive
        ? "bg-[color-mix(in_srgb,var(--brand-solid)_11%,var(--bg-surface))] dark:bg-[color-mix(in_srgb,var(--brand-solid)_22%,var(--bg-surface))]"
        : // group-hover (needs className="group" on the ancestor, not
          // role="group") instead of plain hover: a per-cell hover would
          // only light up the one <td> under the cursor, losing the
          // whole-row hover feel.
          "group-hover:bg-[color-mix(in_srgb,var(--brand-solid)_4%,var(--bg-surface))] dark:group-hover:bg-[color-mix(in_srgb,var(--brand-solid)_10%,var(--bg-surface))]";
    // Dark mode's bg-brand-selected sits close enough in value to
    // border-default that adjacent selected rows' separators nearly
    // vanish - several selected rows in a row then read as one solid block
    // instead of distinct rows. A translucent white border stays visible
    // against any bg it's painted on, so this only needs to apply where the
    // default border actually fails: isSelected + dark mode. Light mode's
    // bg-brand-selected is pale enough that the existing default border
    // already reads fine.
    const cellSelectedBorderClass = isSelected || isActive ? "dark:border-white/20" : undefined;

    return (
        <TableRow
            className={cn(
                "group hover:bg-transparent",
                (clickToSelectActive || onRowClick) && "cursor-pointer",
                onRowClick && "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-solid"
            )}
            onClick={handleRowClick}
            onKeyDown={handleRowKeyDown}
            tabIndex={onRowClick ? 0 : undefined}
        >
            {selectable && (
                <TableCell className={cn(cellBgClass, cellSelectedBorderClass, CELL_TRANSITION)}>
                    <Checkbox
                        checked={!disabled && isSelected}
                        disabled={disabled}
                        onCheckedChange={disabled ? undefined : onToggle}
                        aria-label={selectRowLabel}
                    />
                </TableCell>
            )}
            {showRowNumbers && (
                <TableCell className={cn("text-fg-muted", cellBgClass, cellSelectedBorderClass, CELL_TRANSITION)}>
                    {formatNumber(rowNumber as number, language)}
                </TableCell>
            )}
            {columns.map((col) => {
                const content = col.render(row);
                return (
                    <TableCell
                        key={col.key}
                        className={cn(
                            "overflow-hidden",
                            col.align && ALIGN_CLASS[col.align],
                            cellBgClass,
                            rowClassName,
                            cellSelectedBorderClass,
                            CELL_TRANSITION,
                        )}
                    >
                        {col.truncate ? (
                            <AppTooltip content={plainTextOf(content)}>
                                <div className="overflow-hidden text-ellipsis whitespace-nowrap">{content}</div>
                            </AppTooltip>
                        ) : (
                            content
                        )}
                    </TableCell>
                );
            })}
            {onRowClick && (
                <TableCell className={cn("w-8 text-fg-muted", cellBgClass, cellSelectedBorderClass, CELL_TRANSITION)}>
                    <ChevronRight size={16} aria-hidden="true" />
                </TableCell>
            )}
        </TableRow>
    );
}
