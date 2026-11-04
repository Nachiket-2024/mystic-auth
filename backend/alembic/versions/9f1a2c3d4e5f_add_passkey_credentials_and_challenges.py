"""add passkey credentials and one-time WebAuthn challenges

Revision ID: 9f1a2c3d4e5f
Revises: f6c7d8e9a0b1
Create Date: 2026-11-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "9f1a2c3d4e5f"
down_revision: str | Sequence[str] | None = "f6c7d8e9a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "passkey_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("transports", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("credential_id", name="uq_passkey_credentials_credential_id"),
    )
    op.create_index("ix_passkey_credentials_user_id", "passkey_credentials", ["user_id"])
    op.create_table(
        "passkey_challenges",
        sa.Column("challenge", sa.String(length=128), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("purpose", sa.String(length=16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_passkey_challenges_expires_at", "passkey_challenges", ["expires_at"])
    # Speeds up the ON DELETE CASCADE scan when a user row is purged.
    op.create_index("ix_passkey_challenges_user_id", "passkey_challenges", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_passkey_challenges_user_id", table_name="passkey_challenges")
    op.drop_index("ix_passkey_challenges_expires_at", table_name="passkey_challenges")
    op.drop_table("passkey_challenges")
    op.drop_index("ix_passkey_credentials_user_id", table_name="passkey_credentials")
    op.drop_table("passkey_credentials")
