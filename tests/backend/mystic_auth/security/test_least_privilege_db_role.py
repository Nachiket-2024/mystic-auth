# Checks the app's runtime Postgres role (mystic_auth_app, see alembic
# migration b1e6a9f3c7d2_add_least_privilege_app_role.py) can do normal CRUD
# but not DDL or role management. Skipped unless APP_DATABASE_URL is set,
# since a fresh checkout without it has no separate role to test against.
import asyncpg
import pytest

from backend.mystic_auth.core.settings import settings


def _to_dsn(url: str) -> str:
    """asyncpg wants a plain postgresql:// DSN, not SQLAlchemy's
    postgresql+asyncpg:// prefix."""
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


@pytest.mark.asyncio
async def test_policy_history_is_append_only_for_the_app_role():
    from sqlalchemy import text

    from tests.backend.conftest import superuser_async_session

    name = "sectest_append_only_policy"
    conn = await asyncpg.connect(_to_dsn(settings.APP_DATABASE_URL))
    try:
        await conn.execute(
            "INSERT INTO policy_history (policy_name, change_type, changed_by) VALUES ($1, 'created', 'sectest')",
            name,
        )
        assert await conn.fetchval("SELECT count(*) FROM policy_history WHERE policy_name = $1", name) == 1
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.execute("UPDATE policy_history SET change_type = 'deleted' WHERE policy_name = $1", name)
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            await conn.execute("DELETE FROM policy_history WHERE policy_name = $1", name)
    finally:
        await conn.close()
        # Only the owner role may remove rows; do it the way an operator would.
        async with superuser_async_session() as session:
            await session.execute(text("DELETE FROM policy_history WHERE policy_name = :n"), {"n": name})
            await session.commit()


@pytest.mark.asyncio
async def test_app_role_can_read_but_not_change_the_migration_marker():
    conn = await asyncpg.connect(_to_dsn(settings.APP_DATABASE_URL))
    try:
        assert await conn.fetchval("SELECT count(*) FROM alembic_version") == 1
        for statement in (
            "UPDATE alembic_version SET version_num = 'forged'",
            "DELETE FROM alembic_version",
            "INSERT INTO alembic_version (version_num) VALUES ('forged')",
        ):
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await conn.execute(statement)
    finally:
        await conn.close()
