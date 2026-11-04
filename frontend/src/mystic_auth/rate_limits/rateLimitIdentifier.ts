import type { RateLimitEntry } from "../api/rate_limits_api";

// Account and account + source IP counters are stored under a keyed digest, so
// no email appears in Valkey. The server adds `identifier_label` (an email, or
// "email from IP") when it can match the digest to an account.
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SHORT_DIGEST_LENGTH = 12;

export interface IdentifierDisplay {
    /** What the table shows. */
    text: string;
    /** Full value for the tooltip and the reset dialog. */
    full: string;
    /** True when only a shortened digest is available, shown muted and monospaced. */
    isDigest: boolean;
}

export function describeIdentifier(entry: Pick<RateLimitEntry, "identifier" | "identifier_label">): IdentifierDisplay {
    if (entry.identifier_label) {
        return { text: entry.identifier_label, full: entry.identifier_label, isDigest: false };
    }
    if (DIGEST_PATTERN.test(entry.identifier)) {
        return { text: `${entry.identifier.slice(0, SHORT_DIGEST_LENGTH)}…`, full: entry.identifier, isDigest: true };
    }
    return { text: entry.identifier, full: entry.identifier, isDigest: false };
}
