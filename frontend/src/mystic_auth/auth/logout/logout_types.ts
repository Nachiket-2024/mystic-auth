export interface LogoutResponse {
    message: string;
    /** False only when the server could not confirm this session's Redis
     * chain-version bump (Redis unreachable): cookies are still cleared and
     * the request still reports success, but the leaked token itself may
     * remain valid until it naturally expires. See logout_handler.py. */
    session_revoked: boolean;
}
