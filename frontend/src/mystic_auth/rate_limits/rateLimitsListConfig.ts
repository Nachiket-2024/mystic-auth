/** Mirrors audit_log/auditLogListConfig.ts's totalPagesFor, parameterized on
 * page size instead of a fixed constant since RateLimitsPage uses a smaller
 * page size (10, vs the audit log's 25) to fit one viewport without
 * DataTable's inner scroll area kicking in. */
export function totalPagesFor(total: number, pageSize: number): number {
    return Math.max(1, Math.ceil(total / pageSize));
}
