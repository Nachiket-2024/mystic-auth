# Upgrade -> full downgrade -> upgrade must work on a database of its own. A
# downgrade used to hang on a lock conflict inside the Procrastinate step, fail
# when the app role was still used by another database in the cluster, and leave
# the `userrole` enum behind so the next upgrade failed.
import asyncio
import os
import subprocess
import sys
import uuid
from pathlib import Path

import asyncpg
import pytest
from sqlalchemy.engine import make_url

from backend.mystic_auth.core.settings import settings

BACKEND = Path(__file__).resolve().parents[5] / "backend"


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
        finally:
            await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
    finally:
        await conn.close()
