export interface LogoutResponse {
    message: string;
    /** False only when Redis was unreachable to confirm the chain-version bump.
     * Cookies are still cleared and the request still reports success, but the
     * old token may remain valid until it naturally expires. */
    session_revoked: boolean;
}
