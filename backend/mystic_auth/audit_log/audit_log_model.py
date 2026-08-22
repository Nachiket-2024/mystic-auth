from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from ..database.base import Base


class AuditLog(Base):
    """
    One row per security-sensitive auth event (login, logout, signup, OAuth2
    login, password reset, account verification, account lockout, refresh
    token reuse detection). Written best-effort by
    audit_log_service.log_security_event, never allowed to raise, so a
    logging failure can never break the real action it describes (same
    reasoning as AuthorizationAuditLog).

    Deliberately append-only and independent of the users table (no foreign
    key): a user row can be deleted while its audit history must remain, so
    user_email is stored as a snapshot, not a reference. Nullable, since some
    events (e.g. a failed login for an email that was never registered) have
    no corresponding user.

    Never store passwords, tokens, or other secrets here: only identifiers
    and outcome metadata.
    """

    __tablename__ = "security_audit_log"
    __table_args__ = (
        # Declared here (rather than left implicit) so alembic's autogenerate
        # sees the same composite index migration e7a2c4d8f1b3 created via
        # raw SQL for exact column-direction control, mirroring
        # AuthorizationAuditLog's identical index and c7f1a3e9d2b6's
        # evidence for why: AuditLogRepository.get_for_user's `WHERE
        # user_email = ... ORDER BY created_at DESC, id DESC` needs this
        # exact composite to avoid a sort step.
        Index(
            "ix_security_audit_log_user_email_created_at",
            "user_email",
            text("created_at DESC"),
            text("id DESC"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Nullable for events with no resolvable account, e.g. a login attempt
    # against a nonexistent email. No `index=True` here: covered by the
    # composite `ix_security_audit_log_user_email_created_at` index instead
    # (its leftmost prefix already serves plain user_email lookups), same
    # reasoning as AuthorizationAuditLog's user_email column.
    user_email = Column(String, nullable=True)

    # e.g. "login_success", "login_failure", "logout", "signup",
    # "account_locked", see security_audit_service.py for the full vocabulary.
    event_type = Column(String, nullable=False, index=True)

    success = Column(Boolean, nullable=False)

    # Best-effort request metadata, nullable since not every call site has a
    # live request (e.g. background token-reuse detection).
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)

    # Ties this row back to the structured application logs for the same request.
    request_id = Column(String, nullable=True)

    # Free-form event-specific detail (e.g. {"revoked_count": 3}); never
    # secrets/passwords/tokens.
    event_metadata = Column("metadata", JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
