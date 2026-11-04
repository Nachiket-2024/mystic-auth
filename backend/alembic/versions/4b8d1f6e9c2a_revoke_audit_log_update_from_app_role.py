"""revoke UPDATE on audit log tables from mystic_auth_app

Revision ID: 4b8d1f6e9c2a
Revises: 9c3e7f1a4b8d
Create Date: 2026-11-02 00:00:00.000001

Finishes making security_audit_log/authorization_audit_log fully
append-only for mystic_auth_app: this session's earlier migration
(9c3e7f1a4b8d) revoked DELETE but deliberately kept UPDATE, reasoning that
anonymize_for_user/anonymize_older_than genuinely needed it to strip PII
from a purged or aged-out account's historical rows.

That reasoning is now withdrawn, on reconsideration: anonymizing an
account's audit trail on deletion is itself a liability, not a privacy
feature. Account deletion is the single most predictable thing a user who
just did something malicious will do next, and it's also the last action a
compromised or malicious admin can take: `DELETE /users/{email}/purge`
triggers immediate anonymization with no review step. Letting account
deletion also erase that account's own history from the one record meant
to make bad behavior reviewable after the fact defeats the audit log's
actual purpose. Whether a deployment must erase a particular audit record
depends on its lawful basis, purpose, applicable law, and retention
requirements. GDPR Article 17(3)(e) concerns processing necessary for the
establishment, exercise, or defence of legal claims; it is not a blanket
exception for all security or fraud-prevention records. This migration
implements the template's security decision to preserve the audit trail, not
a legal determination for every deployment. Operators must assess their
obligations and configure an appropriate retention process where required.

anonymize_for_user/anonymize_older_than and the scheduled retention job
that called the latter are removed entirely (not just made unreachable),
alongside this grant change, so there's no dead code claiming to anonymize
rows the app role can no longer write to. A row's email/IP/user-agent now
stay exactly as written, for the life of the table, even past account
deletion.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '4b8d1f6e9c2a'
down_revision: str | Sequence[str] | None = '9c3e7f1a4b8d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "mystic_auth_app"
_AUDIT_TABLES = ["security_audit_log", "authorization_audit_log"]


def upgrade() -> None:
    for table in _AUDIT_TABLES:
        op.execute(f"REVOKE UPDATE ON {table} FROM {APP_ROLE}")


def downgrade() -> None:
    for table in _AUDIT_TABLES:
        op.execute(f"GRANT UPDATE ON {table} TO {APP_ROLE}")
