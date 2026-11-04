"""make policy_history append-only and alembic_version read-only for mystic_auth_app

Revision ID: 6d2a8f4c1e7b
Revises: 5a7c9e1b3d2f
Create Date: 2026-11-04 00:00:00.000000

Same decision as the audit-log tables (9c3e7f1a4b8d, 4b8d1f6e9c2a): a record
meant to make changes reviewable later must not be rewritable by the account
that serves requests.

- policy_history: the app only ever INSERTs rows (PolicyHistoryRepository.
  add_entry) and reads them. UPDATE and DELETE are revoked, so a compromised
  dependency or a stolen runtime credential can no longer edit or erase who
  changed a policy and when. Rows are kept even after their policy or the
  user who made the change is deleted.
- alembic_version: only migrations (a different, privileged role) write it.
  The app keeps SELECT and loses INSERT, UPDATE and DELETE, so the app role
  cannot make the database claim another schema revision.

A migration role or an operator with the owner account can still change
either table on purpose, for example to run a retention policy.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6d2a8f4c1e7b'
down_revision: str | Sequence[str] | None = '5a7c9e1b3d2f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "mystic_auth_app"


def upgrade() -> None:
    op.execute(f"REVOKE UPDATE, DELETE ON policy_history FROM {APP_ROLE}")
    op.execute(f"REVOKE INSERT, UPDATE, DELETE ON alembic_version FROM {APP_ROLE}")


def downgrade() -> None:
    op.execute(f"GRANT UPDATE, DELETE ON policy_history TO {APP_ROLE}")
    op.execute(f"GRANT INSERT, UPDATE, DELETE ON alembic_version TO {APP_ROLE}")
