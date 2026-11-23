"""apply Procrastinate 3.12 schema migrations to existing databases

Revision ID: b7d4e1a9c2f6
Revises: 6d2a8f4c1e7b
Create Date: 2026-11-21 00:00:00.000000

a4c1e8f2b6d3 applies the installed package's full schema.sql once, so a
database created while Procrastinate 3.11 was pinned keeps the 3.11 schema
after the package moves to 3.12. Procrastinate 3.12 code calls objects that
schema lacks (the lock_mode column, procrastinate_defer_jobs_v2 and
procrastinate_defer_periodic_job_v3), so jobs would fail to defer.

This applies Procrastinate's own packaged 3.12.00 migration scripts, the
pre-migrations and then the post-migrations. A fresh database already has the
3.12 schema from a4c1, which this detects through the lock-mode type and
skips. Both phases run here because Alembic runs before the backend and worker
start, so no old worker needs the dropped objects. The two scripts that build
and drop an index concurrently run outside a transaction, as Procrastinate
requires.

Each Procrastinate release that ships a new schema migration needs a similar
revision. The unit test next to the Procrastinate tests fails when the
installed package ships a migration newer than PROCRASTINATE_SCHEMA_VERSION.
"""
from collections.abc import Sequence
from importlib import resources

import sqlalchemy as sa
from sqlalchemy.util import await_only

from alembic import op

revision: str = "b7d4e1a9c2f6"
down_revision: str | Sequence[str] | None = "6d2a8f4c1e7b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Newest Procrastinate migration this revision chain applies.
PROCRASTINATE_SCHEMA_VERSION = "03.12.00"


def upgrade() -> None:
    migrations = resources.files("procrastinate").joinpath("sql/migrations")
    # "pre" scripts are numbered below "post" ones, so name order is apply order.
    scripts = sorted(
        (f for f in migrations.iterdir() if f.name.startswith(f"{PROCRASTINATE_SCHEMA_VERSION}_")),
        key=lambda f: f.name,
    )
    if not scripts:
        raise RuntimeError(
            f"The installed procrastinate package has no {PROCRASTINATE_SCHEMA_VERSION} migrations. "
            "Install procrastinate 3.12 or newer before running this migration."
        )

    # Runs on Alembic's own connection, unlike a4c1: earlier steps of the same
    # upgrade hold locks in this transaction, so a second connection would wait on
    # them forever. The scripts hold several statements, which SQLAlchemy's asyncpg
    # dialect refuses to prepare, so they go to the asyncpg connection directly
    # (it uses the simple protocol).
    bind = op.get_bind()
    if bind.execute(sa.text("SELECT to_regtype('procrastinate_lock_mode')")).scalar() is not None:
        return  # fresh database: a4c1 already applied the 3.12 schema

    for script in scripts:
        sql = script.read_text()
        if "CONCURRENTLY" in sql.upper():
            # Procrastinate requires its concurrent index build and drop to run as a
            # single statement outside a transaction, so the open one is committed first.
            with op.get_context().autocommit_block():
                _execute_script(sql)
        else:
            _execute_script(sql)


def _execute_script(sql: str) -> None:
    asyncpg_connection = op.get_bind().connection.driver_connection
    assert asyncpg_connection is not None
    await_only(asyncpg_connection.execute(sql, timeout=300))


def downgrade() -> None:
    # Nothing to undo on its own: the lock_mode column and v2/v3 functions cannot
    # be removed without losing queued jobs' lock modes, and a4c1's downgrade
    # drops the whole Procrastinate schema anyway.
    pass
