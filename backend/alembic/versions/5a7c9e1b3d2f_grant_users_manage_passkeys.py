"""grant users:manage_passkeys to system_superuser

Revision ID: 5a7c9e1b3d2f
Revises: 4b8d1f6e9c2a
Create Date: 2026-11-03 00:00:00.000000

Data-only migration (per docs/mystic_auth/authorization/adding-permissions.md's
documented process): grants the new users:manage_passkeys permission (see
authorization/permissions.py) to the seeded system_superuser policy only.
Revoking another user's passkeys changes how that account can be signed into,
so it is not added to user_management.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '5a7c9e1b3d2f'
down_revision: str | Sequence[str] | None = '4b8d1f6e9c2a'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE policies
            SET actions = array_append(actions, 'users:manage_passkeys')
            WHERE name = 'system_superuser'
              AND NOT ('users:manage_passkeys' = ANY(actions))
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE policies
            SET actions = array_remove(actions, 'users:manage_passkeys')
            WHERE name = 'system_superuser'
            """
        )
    )
