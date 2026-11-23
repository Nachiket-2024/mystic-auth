# Upgrade -> full downgrade -> upgrade must work on a database of its own. A
# downgrade used to hang on a lock conflict inside the Procrastinate step, fail
# when the app role was still used by another database in the cluster, and leave
# the `userrole` enum behind so the next upgrade failed. It must also leave no
# procrastinate_* type or routine behind, since new Procrastinate releases add
# some (3.12 added a lock-mode enum).
import asyncio
import os
import re
import subprocess
import sys
import uuid
from importlib import resources
from pathlib import Path

import asyncpg
import pytest
from sqlalchemy.engine import make_url

from backend.mystic_auth.core.settings import settings

BACKEND = Path(__file__).resolve().parents[5] / "backend"
# The Procrastinate schema revision and the revision just before it.
PROCRASTINATE_REVISION = "a4c1e8f2b6d3"
PROCRASTINATE_PARENT_REVISION = "e5f6a7b8c9d0"


def _alembic(database_url: str, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "DATABASE_URL": database_url, "APP_DATABASE_URL": ""}
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=240,
        check=False,
    )


async def _leftover_procrastinate_objects(url) -> list[str]:
    conn = await asyncpg.connect(url.render_as_string(hide_password=False))
    try:
        rows = await conn.fetch(
            "SELECT typname AS name FROM pg_type WHERE typname LIKE 'procrastinate\\_%' AND typtype IN ('e', 'c') "
            "UNION SELECT proname FROM pg_proc WHERE proname LIKE 'procrastinate\\_%'"
        )
        return sorted(row["name"] for row in rows)
    finally:
        await conn.close()


def _packaged_migrations_up_to(version: str) -> list[str]:
    """SQL of every packaged Procrastinate migration up to `version`: the schema an
    older release left behind."""
    migrations = resources.files("procrastinate").joinpath("sql/migrations")
    names = sorted(f.name for f in migrations.iterdir() if re.match(r"^\d{2}\.\d{2}\.\d{2}_.*\.sql$", f.name))
    return [migrations.joinpath(n).read_text() for n in names if n[:8] <= version]


async def _procrastinate_fingerprint(url) -> dict[str, list]:
    conn = await asyncpg.connect(url.render_as_string(hide_password=False))
    try:
        return {
            "columns": [tuple(r) for r in await conn.fetch(
                "SELECT table_name, column_name, data_type, column_default FROM information_schema.columns "
                "WHERE table_name LIKE 'procrastinate\\_%' ORDER BY 1, 2")],
            "routines": [r[0] for r in await conn.fetch(
                "SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.proname LIKE 'procrastinate\\_%' ORDER BY 1")],
            "types": [r[0] for r in await conn.fetch(
                "SELECT typname FROM pg_type WHERE typname LIKE 'procrastinate\\_%' AND typtype IN ('e', 'c') ORDER BY 1")],
            "indexes": [r[0] for r in await conn.fetch(
                "SELECT indexname FROM pg_indexes WHERE tablename LIKE 'procrastinate\\_%' ORDER BY 1")],
        }
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_database_on_the_previous_procrastinate_schema_upgrades_to_head():
    """A database created while Procrastinate 3.11 was pinned must end up with the same
    Procrastinate schema as a fresh one after `alembic upgrade head`."""
    base = make_url(settings.DATABASE_URL)
    suffix = uuid.uuid4().hex[:8]
    old_name, fresh_name = f"migration_old_{suffix}", f"migration_fresh_{suffix}"
    admin_dsn = base.set(drivername="postgresql").render_as_string(hide_password=False)

    def alembic_url(name: str) -> str:
        return base.set(database=name).render_as_string(hide_password=False)

    def dsn(name: str):
        return base.set(drivername="postgresql", database=name)

    conn = await asyncpg.connect(admin_dsn)
    try:
        for name in (old_name, fresh_name):
            await conn.execute(f'CREATE DATABASE "{name}"')
        try:
            # Build the older schema: migrations before the Procrastinate revision,
            # then the 3.11 Procrastinate schema by hand, then mark that revision applied.
            result = await asyncio.to_thread(_alembic, alembic_url(old_name), "upgrade", PROCRASTINATE_PARENT_REVISION)
            assert result.returncode == 0, result.stderr[-2000:]
            old = await asyncpg.connect(dsn(old_name).render_as_string(hide_password=False))
            try:
                for sql in _packaged_migrations_up_to("03.11.00"):
                    await old.execute(sql)
                await old.execute(
                    "INSERT INTO procrastinate_jobs (queue_name, task_name, args) VALUES ('default', 'queued_before_upgrade', '{}')"
                )
            finally:
                await old.close()
            assert "procrastinate_lock_mode" not in (await _procrastinate_fingerprint(dsn(old_name)))["types"]

            for args in (("stamp", PROCRASTINATE_REVISION), ("upgrade", "head")):
                result = await asyncio.to_thread(_alembic, alembic_url(old_name), *args)
                assert result.returncode == 0, f"alembic {' '.join(args)} failed:\n{result.stderr[-2000:]}"
            fresh = await asyncio.to_thread(_alembic, alembic_url(fresh_name), "upgrade", "head")
            assert fresh.returncode == 0, fresh.stderr[-2000:]

            assert await _procrastinate_fingerprint(dsn(old_name)) == await _procrastinate_fingerprint(dsn(fresh_name))

            upgraded = await asyncpg.connect(dsn(old_name).render_as_string(hide_password=False))
            try:
                row = await upgraded.fetchrow("SELECT status::text, lock_mode::text FROM procrastinate_jobs WHERE task_name = 'queued_before_upgrade'")
            finally:
                await upgraded.close()
            assert tuple(row) == ("todo", "ordered")
        finally:
            for name in (old_name, fresh_name):
                await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_upgrade_downgrade_upgrade_round_trip():
    base = make_url(settings.DATABASE_URL)
    name = f"migration_roundtrip_{uuid.uuid4().hex[:8]}"
    admin_dsn = base.set(drivername="postgresql").render_as_string(hide_password=False)
    scratch_url = base.set(database=name).render_as_string(hide_password=False)

    conn = await asyncpg.connect(admin_dsn)
    try:
        await conn.execute(f'CREATE DATABASE "{name}"')
        try:
            for args in (("upgrade", "head"), ("downgrade", "base"), ("upgrade", "head")):
                result = await asyncio.to_thread(_alembic, scratch_url, *args)
                assert result.returncode == 0, f"alembic {' '.join(args)} failed:\n{result.stderr[-2000:]}"
                if args[0] == "downgrade":
                    assert await _leftover_procrastinate_objects(base.set(drivername="postgresql", database=name)) == []
        finally:
            await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await conn.close()
