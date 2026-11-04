"""grant users:manage_privileged to system_superuser

Revision ID: 7e2f9c1a8b4d
Revises: 9f1a2c3d4e5f
Create Date: 2026-11-02 00:00:00.000000

Data-only migration (per docs/mystic_auth/authorization/adding-permissions.md's
documented process): grants the new users:manage_privileged permission (see
authorization/permissions.py) to the seeded system_superuser policy only.
Fixes a privilege-hierarchy gap found during a security audit: previously, the
narrowest grant of users:update_any / users:deactivate_any / users:delete_any
/ users:reactivate / users:assign_role alone (e.g. just the user_management
policy, with no other policy) was enough to take over, demote, deactivate,
purge, or reactivate any admin-role account - including setting its password.
users:manage_privileged is now required in addition, whenever the target
account already holds the admin role (see privilege_hierarchy.py). Deliberately
NOT added to user_management: that policy's whole purpose is day-to-day
account management of ordinary accounts, not administration of other admins.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7e2f9c1a8b4d'
down_revision: str | Sequence[str] | None = '9f1a2c3d4e5f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Append rather than restate the list, so actions that a downstream app
    # added to this policy in its own migrations are kept.
    op.execute(
        sa.text(
            """
            UPDATE policies
            SET actions = array_append(actions, 'users:manage_privileged')
            WHERE name = 'system_superuser'
              AND NOT ('users:manage_privileged' = ANY(actions))
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE policies
            SET actions = array_remove(actions, 'users:manage_privileged')
            WHERE name = 'system_superuser'
            """
        )
    )
