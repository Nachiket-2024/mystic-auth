/**
 * Pagination size, filter-placeholder value, timestamp formatting, and page-count/bool-filter
 * parsing shared by all four audit-log section components (authorization_log/ and
 * security_log/), kept here once instead of duplicated per tab.
 */

import type { SupportedLanguage } from "../translations/translations";
import { formatNumber } from "../translations/numerals";
import { monthNameShort } from "../translations/monthNames";
import { formatHourMinute } from "../translations/timeOfDay";

export const PAGE_SIZE = 25;
export const ALL_VALUE = "";

/** e.g. "14 Aug 2026, 8:58 PM" - fixed dd-Mon-yyyy, not the browser's locale format (which
 * could read mm/dd/yyyy for a US viewer looking at the same row as someone elsewhere), so
 * every operator sees the same unambiguous format regardless of system locale. Month name,
 * digits, and time-of-day are still localized to the active language (see timeOfDay.ts for
 * hi/mr's native day-period words). */
export function formatTimestamp(iso: string, language: SupportedLanguage): string {
    const date = new Date(iso);
    const day = String(date.getDate()).padStart(2, "0");
    const month = monthNameShort(date.getMonth(), language);
    const year = date.getFullYear();
    const time = formatHourMinute(date, language);
    return formatNumber(`${day} ${month} ${year}, ${time}`, language);
}

export function totalPagesFor(total: number): number {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** "" (a placeholder "All" option) maps to `undefined` (no filter applied),
 * since the underlying value is never itself a legal filter value. */
export function toBoolFilter(value: string): boolean | undefined {
    if (value === ALL_VALUE) return undefined;
    return value === "true";
}
