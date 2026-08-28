# tests/backend/conftest.py
#
# Real-dependency fixtures shared by every real-DB test suite under
# tests/backend/ (integration/, security/, performance/): an actual
# PostgreSQL and actual Redis (via `docker compose up -d postgres redis`,
# migrated with `docker compose run --rm alembic`), not mocks. See
# the backend testing policy. Security-critical flows must be verified
# against real DB/Redis state, since mocking either one hides exactly the
# kind of bug (e.g. a Redis type mismatch, or a missing session-revocation
# call) these tests exist to catch.
#
# Centralized here (rather than duplicated per subdirectory) specifically
# because of the NullPool reconfiguration below: pytest collects the
# nearest conftest.py up the directory tree regardless of which
# subdirectory is actually invoked (e.g. `pytest tests/backend/security`
# alone never touches tests/backend/integration/), so this fix must live
# somewhere every real-DB suite is guaranteed to import: this file.
import os
import re
from pathlib import Path

# ---------------------------- Environment Setup ----------------------------
# Must run before any `backend.mystic_auth...` import: mystic_auth.core.settings builds its
# Settings() singleton at import time from the process environment, and
# backend.mystic_auth.database.connection / backend.mystic_auth.redis.client build their
# engine/client singletons eagerly at import time too. Both are read once
# and cached for the life of the process.
#
# If DATABASE_URL / REDIS_URL are already set in the environment (e.g. this
# suite is run inside the docker-compose network, where those variables are
# injected as real container env vars pointing at the "postgres"/"redis"
# service hostnames), leave them alone. Otherwise, when running from the host,
# derive a localhost equivalent from the same values already committed in
# .env, so the DB name/credentials never need to be duplicated here.
_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


def _read_env_value(key: str) -> str | None:
    if not _ENV_PATH.exists():
        return None
    for line in _ENV_PATH.read_text().splitlines():
        stripped = line.strip()
        if stripped.startswith(f"{key}=") and not stripped.startswith("#"):
            return stripped.split("=", 1)[1]
    return None


# docker-compose.yml deliberately maps these services to non-default host
# ports (5433, 6380), not their in-container ports (5432, 6379), to avoid
# colliding with a developer's own local Postgres/Redis. A plain hostname
# swap (postgres -> localhost) alone would keep the in-container port and
# connect to whatever else happens to be listening on the real default port
# on the host, silently wrong instead of failing loudly.
_LOCAL_POSTGRES_PORT = "5433"
_LOCAL_REDIS_PORT = "6380"

if "DATABASE_URL" not in os.environ:
    _docker_db_url = _read_env_value("DATABASE_URL")
    if _docker_db_url:
        os.environ["DATABASE_URL"] = re.sub(
            r"@postgres:\d+", f"@localhost:{_LOCAL_POSTGRES_PORT}", _docker_db_url
        )

# database/connection.py's `database` singleton (the request-serving engine
# every integration test actually hits, via the ASGI `client` fixture) uses
# APP_DATABASE_URL when it's set, not DATABASE_URL - see database.py's own
# `settings.APP_DATABASE_URL or settings.DATABASE_URL` and settings.py's
# docstring on APP_DATABASE_URL (the least-privilege app DB role migration).
# .env sets APP_DATABASE_URL too, still pointed at the docker-internal
# "postgres" hostname, so it needs the identical localhost rewrite as
# DATABASE_URL above - without this, every DB-touching integration test run
# from the host (as opposed to inside the docker network) fails at the
# first real query with "Temporary failure in name resolution", while a
# request that never touches the DB (e.g. a bare 401 on a missing cookie)
# still appears to pass, since it never opens a connection at all.
if "APP_DATABASE_URL" not in os.environ:
    _docker_app_db_url = _read_env_value("APP_DATABASE_URL")
    if _docker_app_db_url:
        os.environ["APP_DATABASE_URL"] = re.sub(
            r"@postgres:\d+", f"@localhost:{_LOCAL_POSTGRES_PORT}", _docker_app_db_url
        )

if "REDIS_URL" not in os.environ:
    _docker_redis_url = _read_env_value("REDIS_URL")
    if _docker_redis_url:
        # Use a dedicated logical Redis DB (15) for these test runs so they
        # never collide with whatever a developer has cached in db 0.
        os.environ["REDIS_URL"] = re.sub(
            r"redis://redis:\d+/\d+", f"redis://localhost:{_LOCAL_REDIS_PORT}/15", _docker_redis_url
        )

# ---------------------------- Dedicated test database ----------------------------
# Redirects DATABASE_URL/APP_DATABASE_URL to a `mystic_auth_test` database on
# the SAME Postgres server, instead of the real `mystic_auth` one a running
# dev stack's own `backend`/`procrastinate_worker` containers use.
#
# Without this, `scripts/docker/backend-exec.sh python -m pytest ...` (the
# documented way to run this suite - see docs/mystic_auth/testing/overview.md)
# hits the exact same live database a `docker compose up` dev session's own
# `procrastinate_worker` is watching: DATABASE_URL is "already set" from the
# container's own env_file in that case, so the localhost-rewrite blocks
# above never touch it, and it still resolves to the real dev database.
# Concretely, this is what crashed a real procrastinate_worker container
# after ~800 repeated errors: a deferred job (e.g. an audit-log write) gets
# picked up and processed by that real worker, but before it can persist
# "succeeded" back to procrastinate_jobs, this file's own
# _procrastinate_app_lifecycle fixture (below) has already run its per-test
# `DELETE FROM procrastinate_jobs` teardown - deleting the very row the real
# worker is mid-write on, which then fails with "Job was not found or not
# in doing/todo status". A dedicated database removes the shared table
# entirely, not just this one symptom of sharing it.
#
# Skipped when CI is set (GitHub Actions and effectively every other CI
# provider set this by convention): CI already provisions its own dedicated,
# single-purpose `mystic_auth_ci` Postgres service per run (see ci.yml), so
# there's nothing else there to collide with, and no dev-stack container is
# ever running alongside it.
_BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
_TEST_DB_NAME = "mystic_auth_test"


def _with_database(url: str, db_name: str) -> str:
    return re.sub(r"/[^/@]+$", f"/{db_name}", url)


if not os.environ.get("CI"):
    if "DATABASE_URL" in os.environ:
        _original_database_url = os.environ["DATABASE_URL"]
        os.environ["DATABASE_URL"] = _with_database(_original_database_url, _TEST_DB_NAME)
    else:
        _original_database_url = None
    if "APP_DATABASE_URL" in os.environ:
        os.environ["APP_DATABASE_URL"] = _with_database(os.environ["APP_DATABASE_URL"], _TEST_DB_NAME)

    if _original_database_url:
        import subprocess

        import psycopg

        # CREATE DATABASE can't run inside a transaction block, hence
        # autocommit; connects to the real `mystic_auth` database (already
        # known to exist) rather than assuming a "postgres" maintenance
        # database is reachable under whatever role this app's own
        # DATABASE_URL grants.
        _maintenance_conninfo = _original_database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        with psycopg.connect(_maintenance_conninfo, autocommit=True) as _conn:
            _exists = _conn.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s", (_TEST_DB_NAME,)
            ).fetchone()
            if not _exists:
                _conn.execute(f'CREATE DATABASE "{_TEST_DB_NAME}"')

        # Alembic migration a4c1e8f2b6d3 ("add procrastinate schema") already
        # creates Procrastinate's own queue tables/types as part of this
        # app's normal migration history, so `alembic upgrade head` alone
        # brings a fresh database fully up to date for both; a separate
        # `procrastinate schema --apply` afterward is redundant (and errors,
        # "type already exists") rather than a no-op. Idempotent/fast once
        # already at head, so this runs unconditionally rather than trying
        # to detect "already set up".
        _test_env = os.environ.copy()
        subprocess.run(
            ["alembic", "-c", "alembic.ini", "upgrade", "head"],
            cwd=_BACKEND_DIR, env=_test_env, check=True,
        )

# Safety net, independent of whatever EMAIL_ENABLED happens to be set to in
# .env, and independent of the dedicated test database above: this suite's
# own worker(s) (audit_log/conftest.py's session-scoped subprocess) run
# against mystic_auth_test now, not the real dev database, so a real
# dev-stack procrastinate_worker no longer shares a queue with these tests
# at all. This still guards the one remaining path where a real send could
# happen: this suite's own worker(s) processing a genuinely-deferred
# send_email_task from a signup/password-reset/account-deletion flow.
# Forced here, unconditionally overriding .env (unlike DATABASE_URL/
# REDIS_URL above, which only fill in a value when host env doesn't already
# have one - an explicit `EMAIL_ENABLED=true` already present in the
# environment when pytest is invoked, e.g. a deliberate one-off
# deliverability check, still wins over this).
if "EMAIL_ENABLED" not in os.environ:
    os.environ["EMAIL_ENABLED"] = "false"

# ---------------------------- Imports (after env overrides above) ----------------------------
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from backend.app.main import app
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.procrastinate_tasks.procrastinate_app import (
    app as procrastinate_app,
)
from backend.mystic_auth.redis.client import redis_client

# pytest-asyncio hands each test function its own event loop, but
# `database.engine`'s connection pool is a module-level singleton shared
# across the whole run: a pooled asyncpg connection opened in one test's
# loop is not safe to reuse from a different test's loop and corrupts
# ("another operation is in progress" / "Future attached to a different
# loop"). NullPool opens a fresh connection per checkout and closes it on
# release instead of returning it to a pool, so no connection ever survives
# past the request/session that created it.
database.engine = create_async_engine(database.database_url, echo=False, poolclass=NullPool)
database.async_session = sessionmaker(bind=database.engine, class_=AsyncSession, expire_on_commit=False)


# ---------------------------- Redis isolation ----------------------------
@pytest_asyncio.fixture(autouse=True)
async def _flush_redis_test_db():
    """Every test starts and ends with an empty Redis logical DB, so state
    (rate-limit counters, lockouts, single-use tokens) from one test can
    never leak into the next."""
    await redis_client.flushdb()
    yield
    await redis_client.flushdb()
    # Same cross-event-loop hazard as the Postgres pool above, but for
    # Redis: drop pooled connections so the next test (a different loop)
    # opens fresh ones instead of reusing ones bound to this loop.
    await redis_client.connection_pool.disconnect()


# ---------------------------- Procrastinate connector lifecycle ----------------------------
@pytest_asyncio.fixture(autouse=True)
async def _procrastinate_app_lifecycle():
    """procrastinate_tasks/procrastinate_app.py's `app` is a module-level singleton whose
    PsycopgConnector opens an asyncio-bound psycopg connection pool, the same
    per-event-loop hazard as the Postgres/Redis pools above: pytest-asyncio
    hands each test its own event loop, so a pool opened by one test (e.g.
    one that triggers a `.defer_async()` call via the verify-account/signup
    flow) is not safe to reuse from a different test's loop. Opening and
    closing the connector fresh around every test, rather than once for the
    whole run, avoids that "Future attached to a different loop" failure.

    Also deletes every row from `procrastinate_jobs` on teardown: a real
    integration test (signup, verify, password-reset, account-deletion) hits
    the real ASGI app with no mocking, so `.defer_async()` genuinely inserts
    a job row every time. Without this, rows accumulate indefinitely across
    test runs. Safe to wipe unconditionally now that this suite runs against
    its own dedicated mystic_auth_test database (see the Environment Setup
    section above): no other process shares this table any more, so there's
    no risk of deleting a row a real dev-stack procrastinate_worker still
    has in flight, the way there was when this ran against the real
    database. Same cleanup rationale as `_cleanup_users` below for the
    `users` table."""
    await procrastinate_app.open_async()
    yield
    async with database.async_session() as session:
        await session.execute(text("DELETE FROM procrastinate_jobs"))
        await session.commit()
    await procrastinate_app.close_async()


# ---------------------------- HTTP client ----------------------------
@pytest_asyncio.fixture
async def client():
    """An httpx client wired directly to the real ASGI app (no network
    socket), so requests exercise the actual routing/middleware/dependency
    stack. base_url uses https:// so the client's cookie jar honors the
    Secure attribute on the access_token/refresh_token/oauth_state cookies
    the app sets, otherwise httpx silently drops them."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://testserver", follow_redirects=False) as ac:
        yield ac


# ---------------------------- Postgres cleanup ----------------------------
@pytest_asyncio.fixture
def created_emails():
    """Tests append every email they create to this list; the fixture
    deletes those rows from the real `users` table on teardown so repeated
    runs against the same database don't accumulate test users."""
    emails: list[str] = []
    yield emails


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_users(created_emails):
    yield
    if not created_emails:
        return
    async with database.async_session() as session:
        await session.execute(text("DELETE FROM users WHERE email = ANY(:emails)"), {"emails": created_emails})
        await session.commit()
