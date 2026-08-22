# tests/backend/mystic_auth/security/test_least_privilege_db_role.py
#
# Real-DB proof that the app's runtime Postgres role (mystic_auth_app, see
# alembic migration b1e6a9f3c7d2_add_least_privilege_app_role.py) is
# actually least-privilege: normal CRUD works, but DDL and role management
# are rejected. Opt-in like the feature itself: skipped unless
# APP_DATABASE_URL is actually configured, since a fresh checkout that
# never sets it (falling back to DATABASE_URL everywhere, per
# core/settings.py) has no separate role to test against.
import asyncpg
import pytest

from backend.mystic_auth.core.settings import settings


def _to_dsn(url: str) -> str:
    """asyncpg.connect() wants a plain postgresql:// DSN, not SQLAlchemy's
    postgresql+asyncpg:// dialect prefix - same translation as
    settings.procrastinate_database_url."""
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


pytestmark = pytest.mark.skipif(
    not settings.APP_DATABASE_URL,
    reason="APP_DATABASE_URL not configured - least-privilege role split is opt-in",
)


@pytest.mark.asyncio
async def test_app_role_can_read_and_write_its_own_tables():
    conn = await asyncpg.connect(_to_dsn(settings.APP_DATABASE_URL))
    try:
        await conn.fetch("SELECT id, email FROM users LIMIT 1")
        await conn.execute("SELECT count(*) FROM user_sessions")
        await conn.execute("SELECT count(*) FROM security_audit_log")
        await conn.execute("SELECT count(*) FROM authorization_audit_log")
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_app_role_cannot_run_ddl():
    conn = await asyncpg.connect(_to_dsn(settings.APP_DATABASE_URL))
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.execute("CREATE TABLE sectest_should_never_exist (id int)")
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_app_role_cannot_create_or_alter_roles():
    conn = await asyncpg.connect(_to_dsn(settings.APP_DATABASE_URL))
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.execute("CREATE ROLE sectest_should_never_exist LOGIN")
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_app_role_is_not_superuser():
    conn = await asyncpg.connect(_to_dsn(settings.APP_DATABASE_URL))
    try:
        is_superuser = await conn.fetchval(
            "SELECT rolsuper FROM pg_roles WHERE rolname = current_user"
        )
        assert is_superuser is False
    finally:
        await conn.close()
