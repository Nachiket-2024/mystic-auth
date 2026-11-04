"""revoke DELETE on audit log tables from mystic_auth_app

Revision ID: 9c3e7f1a4b8d
Revises: 7e2f9c1a8b4d
Create Date: 2026-11-02 00:00:00.000000

Fixes a security-audit finding: mystic_auth_app (see
b1e6a9f3c7d2_add_least_privilege_app_role.py) held blanket
SELECT/INSERT/UPDATE/DELETE on every application table, including
security_audit_log and authorization_audit_log. DELETE was never actually
needed on either: no code path deletes individual audit rows - the
retention/purge flow (audit_log_repository.anonymize_for_user,
procrastinate_tasks/audit_log_tasks.py) only ever UPDATEs a row's PII
columns to NULL in place, keeping the row itself (and its event_type/
success/created_at/metadata) for aggregate security value. UPDATE is kept
for that reason; only DELETE is revoked.

This narrows (does not eliminate) what a compromised dependency reusing the
app's live DB connection, or a bad script run with its credentials, could
do to the audit trail: it could still corrupt a row's content via UPDATE
(a separate, broader risk already accepted by the base least-privilege
tradeoff - see docs/mystic_auth/security/decisions-infra.md), but it can no
longer make rows disappear outright.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9c3e7f1a4b8d'
down_revision: str | Sequence[str] | None = '7e2f9c1a8b4d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "mystic_auth_app"
_AUDIT_TABLES = ["security_audit_log", "authorization_audit_log"]


def upgrade() -> None:
    for table in _AUDIT_TABLES:
        op.execute(f"REVOKE DELETE ON {table} FROM {APP_ROLE}")


def downgrade() -> None:
    for table in _AUDIT_TABLES:
        op.execute(f"GRANT DELETE ON {table} TO {APP_ROLE}")
