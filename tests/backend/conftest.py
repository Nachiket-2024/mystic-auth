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

# Safety net, independent of whatever EMAIL_ENABLED happens to be set to in
# .env: every real-DB integration test hits the actual ASGI app with no
# mocking, so signup/password-reset/account-deletion flows genuinely queue
# a Procrastinate send_email_task - and if a worker happens to be running
# against the same database (e.g. a developer's `docker compose up`, or
# manually starting procrastinate_worker to debug something else), those
# jobs get picked up and actually sent via emails/email_sender.py's real
# SMTPEmailSender, against whatever real provider FROM_EMAIL/
# GMAIL_APP_PASSWORD point at - burning a real send quota on every test run
# for recipients that don't exist. Forced here, unconditionally overriding
# .env (unlike DATABASE_URL/REDIS_URL above, which only fill in a value
# when host env doesn't already have one - an explicit `EMAIL_ENABLED=true`
# already present in the environment when pytest is invoked, e.g. a
# deliberate one-off deliverability check, still wins over this).
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
from backend.mystic_auth.procrastinate_tasks.procrastinate_app import app as procrastinate_app
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
    test runs against the same real Postgres database this app's own
    `procrastinate_worker` container also reads from, same rationale as
    `_cleanup_users` below for the `users` table."""
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
