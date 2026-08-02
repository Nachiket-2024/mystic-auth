/**
 * Small, dependency-free helpers shared by every audit-log section
 * component (MyAuthorizationLog, AllAuthorizationLogSection, MySecurityLog,
 * AllSecurityLogSection) and AuditLogPage itself. Split out of what used to
 * be one large AuditLogPage.tsx so each section component can import just
 * what it needs.
 */

export const PAGE_SIZE = 25;
export const ALL_VALUE = "";

export function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString();
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
