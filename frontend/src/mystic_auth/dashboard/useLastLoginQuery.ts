import { useQuery } from "@tanstack/react-query";

import { getMySecurityAuditLogApi } from "../api/audit_api";

export const LAST_LOGIN_QUERY_KEY = ["auditLog", "security", "me", "lastLogin"] as const;

// A login is recorded under one of two event types depending on how the
// user signed in, so both are checked and the more recent one wins.
const LOGIN_EVENT_TYPES = ["login_success", "oauth2_login_success"] as const;

async function fetchLatestLoginAt(eventType: string): Promise<string | null> {
    const res = await getMySecurityAuditLogApi({ limit: 1, eventType, success: true, sortDir: "desc" });
    return res.data[0]?.created_at ?? null;
}

/** The current user's most recent successful login timestamp (ISO string),
 * or null if the audit log has no record of one. */
export function useLastLoginQuery() {
    return useQuery({
        queryKey: LAST_LOGIN_QUERY_KEY,
        queryFn: async () => {
            const timestamps = await Promise.all(LOGIN_EVENT_TYPES.map(fetchLatestLoginAt));
            const found = timestamps.filter((t): t is string => t !== null);
            if (found.length === 0) return null;
            return found.reduce((latest, current) => (current > latest ? current : latest));
        },
    });
}
