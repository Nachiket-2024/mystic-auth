import traceback

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.security.client_ip import get_client_ip
from ..logging.logging_config import get_logger
from .audit_log_repository import audit_log_repository

logger = get_logger(__name__)

# Known event_type values written by the auth handlers/services. Plain
# string constants, not an enum, since nothing else needs to reference these
# beyond passing the literal string at each call site.
LOGIN_SUCCESS = "login_success"
LOGIN_FAILURE = "login_failure"
LOGOUT = "logout"
LOGOUT_ALL = "logout_all"
SIGNUP = "signup"
OAUTH2_LOGIN_SUCCESS = "oauth2_login_success"
# A callback whose state param didn't match the oauth_state cookie, or
# whose state had already expired/been consumed - rejected before any
# account identity is known, so user_email is always None for this one.
# Distinct from OAUTH2_LOGIN_SUCCESS/success=False (which always has a real
# target email): this is the earlier, pre-identity rejection point, and a
# burst of these from one IP is itself a signal worth being able to query
# for (state-replay/CSRF probing), which a generic WARNING log line buried
# in application logs is not.
OAUTH2_STATE_MISMATCH = "oauth2_state_mismatch"
PASSWORD_RESET_REQUESTED = "password_reset_requested"
PASSWORD_RESET_CONFIRMED = "password_reset_confirmed"
ACCOUNT_VERIFICATION_REQUESTED = "account_verification_requested"
ACCOUNT_VERIFIED = "account_verified"
ACCOUNT_LOCKED = "account_locked"
LOGIN_IP_LOCKED = "login_ip_locked"
LOGIN_ACCOUNT_COOLDOWN = "login_account_cooldown"
# One row per rate-limit window and key (not per rejected request), so a flood
# of 429s cannot also flood this table. See RateLimiterService.
RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
REFRESH_TOKEN_REUSE_DETECTED = "refresh_token_reuse_detected"
# A single, clean (non-reuse) refresh redemption whose IP and/or User-Agent
# differs from the ones recorded when this session chain was first created.
# Not proof of theft on its own (a legitimate user switching networks/devices
# triggers this too), but it is the one concrete signal a stolen-and-used-
# once token leaves that reuse-detection alone never catches - see
# RefreshTokenService's refresh_tokens()/session_service.rotate_session.
REFRESH_TOKEN_CONTEXT_CHANGED = "refresh_token_context_changed"
SESSION_EVENT_CONNECTION_LIMIT_EXCEEDED = "session_event_connection_limit_exceeded"
SESSION_REVOKED = "session_revoked"           # One specific session ended via the Manage Sessions card
ACCOUNT_DELETED = "account_deleted"           # Soft delete (reversible), management-initiated
ACCOUNT_DELETED_SELF = "account_deleted_self"  # Soft delete (reversible), self-initiated via DELETE /users/me
ACCOUNT_PURGED = "account_purged"             # Hard delete (irreversible)
ACCOUNT_REACTIVATED = "account_reactivated"   # Restored from soft delete
POLICY_ASSIGNED = "policy_assigned"
POLICY_REVOKED = "policy_revoked"
POLICY_ACTION_REVOKED = "policy_action_revoked"  # One action carved out of a policy assignment; remaining actions kept as direct grants
PERMISSION_GRANTED = "permission_granted"
PERMISSION_REVOKED = "permission_revoked"
USER_ROLE_CHANGED = "user_role_changed"
USER_FIELDS_UPDATED = "user_fields_updated"  # Management-driven PUT /users/{email}; field names only, never values
# Passkey (WebAuthn) lifecycle and sign-in, see docs/mystic_auth/authentication/passkeys.md.
# Failures carry success=False. Step-up is the "confirm it's you" check that
# gates adding or removing a passkey (password, passkey, or Google).
PASSKEY_REGISTERED = "passkey_registered"
PASSKEY_REGISTRATION_FAILURE = "passkey_registration_failure"
PASSKEY_RENAMED = "passkey_renamed"
PASSKEY_REMOVED = "passkey_removed"  # One or several; metadata has count and scope (single/selected/all)
PASSKEY_LOGIN_SUCCESS = "passkey_login_success"
PASSKEY_LOGIN_FAILURE = "passkey_login_failure"
PASSKEY_STEP_UP_SUCCESS = "passkey_step_up_success"  # metadata.method: password, passkey, or google
PASSKEY_STEP_UP_FAILURE = "passkey_step_up_failure"

# Case-insensitive substring denylist for metadata keys that must never be
# persisted verbatim, applied recursively so nested dicts are covered too.
# Current call sites only ever pass emails/counts, so this is a
# defense-in-depth backstop against a future call site passing something
# sensitive, not a fix for an existing leak.
_SENSITIVE_METADATA_KEY_MARKERS = ("password", "hash", "token", "secret", "cookie", "jwt", "credential")


def _redact_value(key: str, value: object) -> object:
    if any(marker in key.lower() for marker in _SENSITIVE_METADATA_KEY_MARKERS):
        return "[REDACTED]"
    if isinstance(value, dict):
        return _redact_sensitive_metadata(value)
    return value


def _redact_sensitive_metadata(metadata: dict | None) -> dict | None:
    if metadata is None:
        return None

    return {key: _redact_value(key, value) for key, value in metadata.items()}


async def log_security_event(
    event_type: str,
    db: AsyncSession | None,
    *,
    user_email: str | None = None,
    success: bool = True,
    request: Request | None = None,
    metadata: dict | None = None,
) -> None:
    """
    Writes one security audit log row. A logging failure must never break the
    auth action it's describing, so errors here are caught and logged as a
    warning, never re-raised. Mirrors authorization_audit_logger.log_decision.

    `db=None` is accepted so unit tests can call handlers/services directly
    without wiring a session through every mocked collaborator; a real
    request always supplies one via Depends(database.get_session).
    """
    if db is None:
        return

    try:
        ip_address = None
        user_agent = None
        request_id = None
        if request is not None:
            ip_address = get_client_ip(request)
            user_agent = request.headers.get("user-agent")
            request_id = getattr(request.state, "request_id", None)

        await audit_log_repository.create_entry(
            {
                "user_email": user_email,
                "event_type": event_type,
                "success": success,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "request_id": request_id,
                "event_metadata": _redact_sensitive_metadata(metadata),
            },
            db,
        )
    except Exception:
        logger.warning("Failed to write security audit log entry:\n%s", traceback.format_exc())

    if success and event_type in _REALTIME_ALERT_EVENTS:
        await _alert_privilege_change(event_type, user_email, metadata)


# Changes to who may do what. A quiet grant or role change is how an insider or
# a stolen privileged session widens its own access, so each one is also pushed
# to the real-time alert sinks, not only written to the audit table.
_REALTIME_ALERT_EVENTS = frozenset({USER_ROLE_CHANGED, POLICY_ASSIGNED})
_ALERT_DEDUPE_SECONDS = 60


async def _alert_privilege_change(event_type: str, target_email: str | None, metadata: dict | None) -> None:
    """Send one alert per actor, event type and minute, so a bulk request of
    100 grants is one alert and not 100 inline webhook calls. Never raises."""
    try:
        from ..error_monitoring.sentry_service import capture_security_alert
        from ..valkey.client import valkey_client

        meta = metadata or {}
        actor = str(meta.get("changed_by") or meta.get("assigned_by") or meta.get("actor") or "unknown")
        if not await valkey_client.set(f"alert_sent:{event_type}:{actor}", "1", ex=_ALERT_DEDUPE_SECONDS, nx=True):
            return
        await capture_security_alert(
            event_type,
            metadata={"actor": actor, "target": target_email or ""},
        )
    except Exception:
        logger.warning("Could not send privilege-change alert:\n%s", traceback.format_exc())
