# tests/backend/mystic_auth/unit/core/test_settings_unit.py
import pytest
from pydantic import ValidationError

from backend.mystic_auth.core.settings import Settings

from .settings_valid_fields import ALL_FIELDS


def test_settings_construction_succeeds_with_only_declared_fields():
    # Baseline: confirms ALL_FIELDS is a complete, valid payload.
    # If this fails, every other test in the file is testing against a
    # payload that was already broken for an unrelated reason.
    Settings(_env_file=None, **ALL_FIELDS)


def test_webauthn_origins_must_be_secure_and_within_the_rp_id():
    with pytest.raises(ValidationError, match="HTTPS"):
        Settings(
            _env_file=None,
            **{**ALL_FIELDS, "WEBAUTHN_ORIGINS": "http://app.example.test"},
        )

    with pytest.raises(ValidationError, match="subdomain"):
        Settings(
            _env_file=None,
            **{
                **ALL_FIELDS,
                "WEBAUTHN_RP_ID": "example.test",
                "WEBAUTHN_ORIGINS": "https://attacker.test",
            },
        )


@pytest.mark.parametrize(
    "missing_field",
    sorted(
        set(ALL_FIELDS)
        - {
            "TRUSTED_PROXY_IPS",
            "SESSION_ROW_RETENTION_HOURS",
            "REFRESH_TOKEN_REUSE_GRACE_SECONDS",
            "WEBAUTHN_RP_ID",
            "WEBAUTHN_ORIGINS",
            "WEBAUTHN_RP_NAME",
            "WEBAUTHN_CHALLENGE_TTL_SECONDS",
        }
    ),
)
def test_settings_construction_fails_when_any_field_is_missing(
    missing_field, monkeypatch
):
    # Every field except TRUSTED_PROXY_IPS and SESSION_ROW_RETENTION_HOURS is
    # required: a silent fallback could let a real deployment start up
    # misconfigured with no error.
    # monkeypatch.delenv is needed alongside omitting the kwarg: _env_file=None
    # only disables reading a dotenv file, pydantic-settings still falls back
    # to the real process environment (set here by docker-compose's env_file:),
    # which this suite runs inside.
    monkeypatch.delenv(missing_field, raising=False)
    payload = {key: value for key, value in ALL_FIELDS.items() if key != missing_field}

    with pytest.raises(ValidationError):
        Settings(_env_file=None, **payload)


def test_trusted_proxy_ips_defaults_to_empty_when_missing(monkeypatch):
    # The one exception to "every field is required": alembic and
    # procrastinate_worker read the same env file as the backend but never
    # call get_client_ip(), so they shouldn't need a value here at all. Only
    # the backend service actually needs a real value, injected via each
    # prod/local-prod-* Compose file's own environment: override.
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)
    payload = {
        key: value for key, value in ALL_FIELDS.items() if key != "TRUSTED_PROXY_IPS"
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.TRUSTED_PROXY_IPS == ""


def test_session_row_retention_hours_defaults_to_one_when_missing(monkeypatch):
    # The other exception to "every field is required": a generic internal
    # cleanup buffer, not a per-deployment knob, so no env file needs to
    # carry it (see the fixture comment above).
    monkeypatch.delenv("SESSION_ROW_RETENTION_HOURS", raising=False)
    payload = {
        key: value
        for key, value in ALL_FIELDS.items()
        if key != "SESSION_ROW_RETENTION_HOURS"
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.SESSION_ROW_RETENTION_HOURS == 1


def test_webauthn_settings_default_from_frontend_and_app_name(monkeypatch):
    webauthn_fields = {
        "WEBAUTHN_RP_ID",
        "WEBAUTHN_ORIGINS",
        "WEBAUTHN_RP_NAME",
        "WEBAUTHN_CHALLENGE_TTL_SECONDS",
    }
    for field in webauthn_fields:
        monkeypatch.delenv(field, raising=False)
    payload = {
        key: value for key, value in ALL_FIELDS.items() if key not in webauthn_fields
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.webauthn_rp_id == "localhost"
    assert settings.webauthn_origins == ["http://localhost:5173"]
    assert settings.webauthn_rp_name == "TestApp"
    assert settings.WEBAUTHN_CHALLENGE_TTL_SECONDS == 300


def test_settings_ignores_env_vars_that_are_not_declared_fields():
    # Regression guard: env/mystic_auth/.env.dev is shared with docker-compose.dev.yml's
    # `env_file:` directive, which also passes it to infra-only services.
    # VALKEY_PASSWORD (valkey-server's own auth) and BUGSINK_* (the optional
    # self-hosted error-monitoring service, see
    # docs/mystic_auth/error-monitoring/overview.md) have no corresponding
    # Settings field. pydantic-settings defaults to extra="forbid", which
    # crashed Settings() construction whenever such a var was present.
    # Settings.Config now sets extra="ignore".
    payload = {
        **ALL_FIELDS,
        "VALKEY_PASSWORD": "valkey-password",
        "BUGSINK_SECRET_KEY": "bugsink-secret",
        "BUGSINK_SUPERUSER_EMAIL": "admin@example.com",
        "BUGSINK_SUPERUSER_PASSWORD": "bugsink-password",
        "BUGSINK_BASE_URL": "http://localhost:8010",
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.APP_NAME == "TestApp"
    assert not hasattr(settings, "VALKEY_PASSWORD")


# ---------------------------- cors_allowed_origins ----------------------------


def test_cors_allowed_origins_is_just_frontend_base_url_when_additional_unset():
    settings = Settings(_env_file=None, **ALL_FIELDS)

    assert settings.cors_allowed_origins == ["http://localhost:5173"]


def test_cors_allowed_origins_includes_additional_origins_in_order():
    payload = {
        **ALL_FIELDS,
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
        **ALL_FIELDS,
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
        **ALL_FIELDS,
        "FRONTEND_ADDITIONAL_BASE_URLS": "http://localhost:5173,https://www.example.com",
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.cors_allowed_origins == [
        "http://localhost:5173",
        "https://www.example.com",
    ]


def test_refresh_token_reuse_grace_seconds_defaults_to_ten_when_missing(monkeypatch):
    monkeypatch.delenv("REFRESH_TOKEN_REUSE_GRACE_SECONDS", raising=False)
    payload = {
        key: value
        for key, value in ALL_FIELDS.items()
        if key != "REFRESH_TOKEN_REUSE_GRACE_SECONDS"
    }

    settings = Settings(_env_file=None, **payload)

    assert settings.REFRESH_TOKEN_REUSE_GRACE_SECONDS == 10
