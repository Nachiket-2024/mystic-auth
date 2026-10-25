import pytest

from backend.mystic_auth.core.settings import Settings


@pytest.mark.parametrize(
    ("environment", "expected_secure"),
    [("development", False), ("Development", False), ("production", True), ("staging", True)],
)
def test_secure_cookies_only_disable_for_development(environment, expected_secure):
    settings = Settings.model_construct(ENVIRONMENT=environment)

    assert settings.secure_cookies is expected_secure


@pytest.mark.parametrize(
    ("database_url", "expected_url"),
    [
        (
            "postgresql+asyncpg://user:pass@localhost:5432/db",
            "postgresql://user:pass@localhost:5432/db",
        ),
        ("postgresql://user:pass@localhost:5432/db", "postgresql://user:pass@localhost:5432/db"),
        (
            "postgresql+asyncpg://user:pass@localhost:5432/postgresql+asyncpg://db",
            "postgresql://user:pass@localhost:5432/postgresql+asyncpg://db",
        ),
    ],
)
def test_procrastinate_database_url_rewrites_only_the_sqlalchemy_scheme(database_url, expected_url):
    settings = Settings.model_construct(DATABASE_URL=database_url)

    assert settings.procrastinate_database_url == expected_url


def test_procrastinate_worker_database_url_prefers_the_least_privilege_app_role():
    """Regression guard for audit finding claude_code-2026-10-21-F-001: the
    long-lived worker connector must connect as the scoped mystic_auth_app
    role (via APP_DATABASE_URL) when one is configured, not the DDL-capable
    superuser DATABASE_URL role it only needs for Alembic's own runs."""
    settings = Settings.model_construct(
        DATABASE_URL="postgresql+asyncpg://postgres:super@localhost:5432/mystic_auth",
        APP_DATABASE_URL="postgresql+asyncpg://mystic_auth_app:scoped@localhost:5432/mystic_auth",
    )

    assert settings.procrastinate_worker_database_url == (
        "postgresql://mystic_auth_app:scoped@localhost:5432/mystic_auth"
    )


def test_procrastinate_worker_database_url_falls_back_without_app_database_url():
    settings = Settings.model_construct(
        DATABASE_URL="postgresql+asyncpg://postgres:super@localhost:5432/mystic_auth",
        APP_DATABASE_URL="",
    )

    assert settings.procrastinate_worker_database_url == (
        "postgresql://postgres:super@localhost:5432/mystic_auth"
    )


def test_procrastinate_database_url_stays_on_the_ddl_capable_role_regardless():
    """procrastinate_database_url (used by the schema-creating migration)
    must never follow APP_DATABASE_URL - only procrastinate_worker_database_url
    does. A migration run with APP_DATABASE_URL configured would otherwise
    fail outright for lacking DDL rights."""
    settings = Settings.model_construct(
        DATABASE_URL="postgresql+asyncpg://postgres:super@localhost:5432/mystic_auth",
        APP_DATABASE_URL="postgresql+asyncpg://mystic_auth_app:scoped@localhost:5432/mystic_auth",
    )

    assert settings.procrastinate_database_url == (
        "postgresql://postgres:super@localhost:5432/mystic_auth"
    )
