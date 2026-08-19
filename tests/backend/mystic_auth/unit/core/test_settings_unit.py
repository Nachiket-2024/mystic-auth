# tests/backend/mystic_auth/unit/test_settings_unit.py
import pytest
from pydantic import ValidationError

from backend.mystic_auth.core.settings import Settings

# Every Settings field is required, no Python-level defaults: .env (or the
# process environment) is the single source of truth for every value, dev
# and prod alike. This fixture is a complete, valid payload; the tests below
# poke at deviations from it.
_ALL_FIELDS = {
    "BACKEND_BASE_URL": "http://localhost:8000",
    "FRONTEND_BASE_URL": "http://localhost:5173",
    "FRONTEND_ADDITIONAL_BASE_URLS": "",
    "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/db",
    "POSTGRES_USER": "user",
    "POSTGRES_PASSWORD": "pass",
    "POSTGRES_DB": "db",
    "SECRET_KEY": "a" * 32,
    "ACCESS_TOKEN_EXPIRE_MINUTES": 15,
    "REFRESH_TOKEN_EXPIRE_MINUTES": 43200,
    "JWT_ALGORITHM": "HS256",
    "JWT_ISSUER": "http://localhost:8000",
    "JWT_AUDIENCE": "http://localhost:8000",
    "RESET_TOKEN_EXPIRE_MINUTES": 60,
    "ACCOUNT_DELETE_TOKEN_EXPIRE_MINUTES": 60,
    "GOOGLE_CLIENT_ID": "client-id",
    "GOOGLE_CLIENT_SECRET": "client-secret",
    "GOOGLE_REDIRECT_URI": "http://localhost:8000/auth/oauth2/callback/google",
    "REDIS_URL": "redis://localhost:6379/0",
    "CACHE_DEFAULT_TTL": 300,
    "FROM_EMAIL": "from@example.com",
    "GMAIL_APP_PASSWORD": "app-password",
    "SUPPORT_EMAIL": "",
    "SMTP_HOST": "smtp.gmail.com",
    "SMTP_PORT": 587,
    "APP_NAME": "TestApp",
    "LOGIN_LOCKOUT_TIME": 300,
    "MAX_FAILED_LOGIN_ATTEMPTS": 5,
    "LOGIN_LOCKOUT_TIME_PER_IP": 300,
    "MAX_FAILED_LOGIN_ATTEMPTS_PER_IP": 20,
    "MAX_REQUESTS_PER_WINDOW": 100,
    "REQUEST_WINDOW_SECONDS": 60,
    "LOG_LEVEL": "INFO",
    "ENVIRONMENT": "development",
    "TRUSTED_PROXY_IPS": "",
    "GEOIP_DB_PATH": "",
    "SENTRY_DSN": "",
    "SENTRY_ENVIRONMENT": "",
    "DEFAULT_APP_POLICIES": "",
    "ACCOUNT_PURGE_GRACE_DAYS": 30,
    "USER_EXPORT_MAX_ROWS": 50000,
}


def test_settings_construction_succeeds_with_only_declared_fields():
    # Baseline: the fixture above actually is a complete, valid Settings
    # payload : if this ever fails, the other tests in this file would be
    # testing against a payload that was already broken for an unrelated
    # reason.
    Settings(_env_file=None, **_ALL_FIELDS)


@pytest.mark.parametrize("missing_field", sorted(_ALL_FIELDS))
def test_settings_construction_fails_when_any_field_is_missing(missing_field, monkeypatch):
    # Every field is required: .env is the source of truth, not a Python
    # default. A field silently falling back would mean a real deployment
    # could start up misconfigured without any error. monkeypatch.delenv is
    # needed alongside omitting the kwarg: _env_file=None only disables
    # reading a dotenv file, pydantic-settings still falls back to the real
    # process environment (set here by docker-compose's env_file:), which
    # this suite runs inside.
    monkeypatch.delenv(missing_field, raising=False)
    payload = {key: value for key, value in _ALL_FIELDS.items() if key != missing_field}

    with pytest.raises(ValidationError):
        Settings(_env_file=None, **payload)


def test_settings_ignores_env_vars_that_are_not_declared_fields():
    # Regression guard: the root .env is shared with docker-compose.yml's
    # `env_file:` directive, which also passes it to infra-only services :
    # REDIS_PASSWORD (redis-server's own auth) and BUGSINK_* (the optional
    # self-hosted error-monitoring service, see
    # docs/mystic_auth/error-monitoring/overview.md) have no corresponding Settings
    # field. pydantic-settings defaults to extra="forbid", which crashed
    # Settings() construction the moment any such var was present : this
    # only actually surfaced when Settings' own env_file resolved to a real
    # file (true when cwd=/repo, e.g. running tests) rather than the app's
    # own cwd=/app, where a relative ".env" never resolves to anything :
    # so the same .env silently worked for the running app while crashing
    # every test collection. Settings.Config now sets extra="ignore".
    payload = {
        **_ALL_FIELDS,
        "REDIS_PASSWORD": "redis-password",
        "BUGSINK_SECRET_KEY": "bugsink-secret",
        "BUGSINK_SUPERUSER_EMAIL": "admin@example.com",
        "BUGSINK_SUPERUSER_PASSWORD": "bugsink-password",
        "BUGSINK_BASE_URL": "http://localhost:8010",
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.APP_NAME == "TestApp"
    assert not hasattr(settings, "REDIS_PASSWORD")


# ---------------------------- cors_allowed_origins ----------------------------


def test_cors_allowed_origins_is_just_frontend_base_url_when_additional_unset():
    settings = Settings(_env_file=None, **_ALL_FIELDS)

    assert settings.cors_allowed_origins == ["http://localhost:5173"]


def test_cors_allowed_origins_includes_additional_origins_in_order():
    payload = {
        **_ALL_FIELDS,
        "FRONTEND_ADDITIONAL_BASE_URLS": "https://staging.example.com,https://www.example.com",
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.cors_allowed_origins == [
        "http://localhost:5173",
        "https://staging.example.com",
        "https://www.example.com",
    ]


def test_cors_allowed_origins_ignores_blank_entries_and_stray_whitespace():
    payload = {
        **_ALL_FIELDS,
        "FRONTEND_ADDITIONAL_BASE_URLS": " https://staging.example.com , , https://www.example.com ,",
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.cors_allowed_origins == [
        "http://localhost:5173",
        "https://staging.example.com",
        "https://www.example.com",
    ]


def test_cors_allowed_origins_deduplicates_a_repeated_origin():
    payload = {
        **_ALL_FIELDS,
        "FRONTEND_ADDITIONAL_BASE_URLS": "http://localhost:5173,https://www.example.com",
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.cors_allowed_origins == ["http://localhost:5173", "https://www.example.com"]


# ---------------------------- default_app_policy_names ----------------------------


def test_default_app_policy_names_is_empty_when_unset():
    settings = Settings(_env_file=None, **_ALL_FIELDS)

    assert settings.default_app_policy_names == []


def test_default_app_policy_names_parses_deduplicates_and_trims():
    payload = {
        **_ALL_FIELDS,
        "DEFAULT_APP_POLICIES": " billing_admin , support_agent, billing_admin ,",
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.default_app_policy_names == ["billing_admin", "support_agent"]
