/**
 * Mirrors backend/mystic_auth/audit_log/audit_log_service.py's event_type
 * constants exactly, the same pattern authorization/permissions.ts already
 * uses for Permission: centralized here so the Security events filter
 * dropdown offers exactly the values the backend actually writes, instead
 * of a typed-in string that can never match a real row.
 */
// "login" (not "login_success"/"login_failure" as two options): the Result
// filter (Success/Failed) already narrows to one or the other, so listing
// both here too let you pick an impossible combination (event=login_success
// + Result=Failed). The backend still stores both literal values; "login" is
// a UI-only alias that audit_log_repository.py's _apply_filters expands back.
export const SECURITY_EVENT_TYPES = [
    "login",
    "logout",
    "logout_all",
    "session_revoked",
    "signup",
    "oauth2_login_success",
    "password_reset_requested",
    "password_reset_confirmed",
    "account_verification_requested",
    "account_verified",
    "account_locked",
    "refresh_token_reuse_detected",
    "account_deleted",
    "account_purged",
    "account_reactivated",
    "policy_assigned",
    "policy_revoked",
    "user_role_changed",
] as const;
