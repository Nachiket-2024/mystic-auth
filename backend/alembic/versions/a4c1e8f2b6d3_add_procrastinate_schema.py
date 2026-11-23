"""add procrastinate schema

Revision ID: a4c1e8f2b6d3
Revises: e5f6a7b8c9d0
Create Date: 2026-08-19 00:00:00.000000

Applies Procrastinate's own packaged schema SQL (procrastinate_jobs,
procrastinate_events, procrastinate_periodic_defers and their supporting
functions/triggers), read directly from the installed `procrastinate`
package rather than hand-transcribed, so it always matches the pinned
version's actual schema (`procrastinate/sql/schema.sql`).

Replaces taskiq (Valkey Streams): background jobs now live as rows in this
same Postgres database instead of a separate Valkey broker. See
backend/mystic_auth/procrastinate_tasks/.
"""
from collections.abc import Sequence
from importlib import resources

import psycopg
import sqlalchemy as sa

from alembic import op
from mystic_auth.core.settings import settings

revision: str = "a4c1e8f2b6d3"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _run_multi_statement_sql(sql: str) -> None:
    """Applies a raw, possibly multi-statement (including dollar-quoted
    CREATE FUNCTION/DO block) SQL script.

    Not done via `op.execute()`: env.py's async engine goes through
    SQLAlchemy's asyncpg dialect, which always prepares statements before
    executing them, and asyncpg refuses to prepare a string containing more
    than one command ("cannot insert multiple commands into a prepared
    statement") - fatal for a multi-statement script like Procrastinate's
    packaged schema.sql. A separate, synchronous psycopg connection (the
    same driver Procrastinate itself uses) runs the whole script as one
    simple-protocol query instead, sidestepping that restriction entirely.
    Reuses the same DATABASE_URL this migration run is already targeting,
    via the same postgresql+asyncpg -> postgresql translation
    settings.procrastinate_database_url applies for the running app.
    """
    with psycopg.connect(settings.procrastinate_database_url) as conn:
        conn.execute(sql)


def upgrade() -> None:
    schema_sql = resources.files("procrastinate").joinpath("sql/schema.sql").read_text()
    _run_multi_statement_sql(schema_sql)


def downgrade() -> None:
    # Unlike upgrade(), this runs on Alembic's own connection: a second
    # connection would wait forever on locks the earlier steps of a multi-step
    # downgrade still hold.
    #
    # Routine names carry versioned suffixes (_v1, _v2, ...) that change between
    # Procrastinate releases, so drop everything named procrastinate_* found via
    # the catalog instead of a hand-kept list that would rot on the next bump.
    op.execute(
        sa.text(
            """
            DO $$
            DECLARE
                r record;
            BEGIN
                FOR r IN
                    SELECT p.oid::regprocedure AS signature, p.prokind
                    FROM pg_proc p
                    JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname LIKE 'procrastinate\\_%'
                LOOP
                    EXECUTE format(
                        'DROP %s IF EXISTS %s CASCADE',
                        CASE r.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
                        r.signature
                    );
                END LOOP;
            END $$
            """
        )
    )
    for statement in (
        "DROP TABLE IF EXISTS procrastinate_events CASCADE",
        "DROP TABLE IF EXISTS procrastinate_periodic_defers CASCADE",
        "DROP TABLE IF EXISTS procrastinate_jobs CASCADE",
        "DROP TABLE IF EXISTS procrastinate_workers CASCADE",
    ):
        op.execute(sa.text(statement))
    # Types are dropped by catalog query for the same reason as the routines:
    # releases add new ones (3.12 added procrastinate_lock_mode), and a missed
    # type makes the next upgrade fail with "type already exists".
    op.execute(
        sa.text(
            """
            DO $$
            DECLARE
                r record;
            BEGIN
                FOR r IN
                    SELECT t.oid::regtype AS type_name
                    FROM pg_type t
                    JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE n.nspname = 'public'
                      AND t.typname LIKE 'procrastinate\\_%'
                      AND t.typtype IN ('e', 'c')
                      AND (t.typrelid = 0
                           OR (SELECT c.relkind FROM pg_class c WHERE c.oid = t.typrelid) = 'c')
                LOOP
                    EXECUTE format('DROP TYPE IF EXISTS %s CASCADE', r.type_name);
                END LOOP;
            END $$
            """
        )
    )
