# tests/backend/mystic_auth/unit/core/test_settings_secret_and_alert_validation_unit.py
# SECRET_KEY strength and security-alert webhook rules, split out of test_settings_unit.py.
import pytest
from pydantic import ValidationError

from backend.mystic_auth.core.settings import Settings

from .settings_valid_fields import ALL_FIELDS


def test_secret_key_validation_rejects_short_values():
    with pytest.raises(
        ValidationError, match="SECRET_KEY must be at least 32 characters"
    ):
        Settings(_env_file=None, **{**ALL_FIELDS, "SECRET_KEY": "too-short"})


def test_production_without_alert_webhook_is_rejected():
    with pytest.raises(
        ValidationError, match="SECURITY_ALERT_WEBHOOK_URL is required in production"
    ):
        Settings(_env_file=None, **{**ALL_FIELDS, "ENVIRONMENT": "production"})


@pytest.mark.parametrize(
    "url",
    [
        "http://alerts.example.com/hook",
        "https:///missing-host",
        "https://user:password@alerts.example.com/hook",
    ],
)
def test_security_alert_webhook_rejects_insecure_or_credential_bearing_urls(url):
    with pytest.raises(
        ValidationError, match="must be an HTTPS URL without embedded credentials"
    ):
        Settings(_env_file=None, **{**ALL_FIELDS, "SECURITY_ALERT_WEBHOOK_URL": url})


def test_production_with_an_alert_webhook_configured_is_accepted():
    settings = Settings(
        _env_file=None,
        **{
            **ALL_FIELDS,
            "ENVIRONMENT": "production",
            "SECURITY_ALERT_WEBHOOK_URL": "https://alerts.example.com/hook",
        },
    )
    assert settings.SECURITY_ALERT_WEBHOOK_URL == "https://alerts.example.com/hook"


def test_development_without_alert_webhook_is_allowed():
    """The default dev/test env file leaves this unset deliberately."""
    settings = Settings(_env_file=None, **ALL_FIELDS)
    assert settings.SECURITY_ALERT_WEBHOOK_URL == ""


_PLACEHOLDER_KEY = "change_me_in_production_generate_your_own_random_32plus_char_key"


@pytest.mark.parametrize("environment", ["production", "staging"])
def test_placeholder_secret_key_is_rejected_outside_development(environment):
    with pytest.raises(ValidationError, match="example placeholder"):
        Settings(
            _env_file=None,
            **{
                **ALL_FIELDS,
                "ENVIRONMENT": environment,
                "SECRET_KEY": _PLACEHOLDER_KEY,
                "SECURITY_ALERT_WEBHOOK_URL": "https://alerts.example.com/hook",
            },
        )


def test_placeholder_secret_key_is_allowed_in_development():
    settings = Settings(
        _env_file=None,
        **{**ALL_FIELDS, "ENVIRONMENT": "development", "SECRET_KEY": _PLACEHOLDER_KEY},
    )
    assert settings.SECRET_KEY == _PLACEHOLDER_KEY


@pytest.mark.parametrize("url", ["http://ntfy:8080/alerts", "http://ntfy/alerts"])
def test_security_alert_webhook_allows_plain_http_to_a_compose_service_name(url):
    settings = Settings(_env_file=None, **{**ALL_FIELDS, "SECURITY_ALERT_WEBHOOK_URL": url})
    assert url == settings.SECURITY_ALERT_WEBHOOK_URL


@pytest.mark.parametrize(
    "url",
    ["http://ntfy.example.com/alerts", "http://203.0.113.5/alerts", "http://2130706433/a", "http://localhost.evil.com:8080/a"],
)
def test_security_alert_webhook_still_rejects_plain_http_to_dotted_hosts(url):
    with pytest.raises(ValidationError, match="must be an HTTPS URL"):
        Settings(_env_file=None, **{**ALL_FIELDS, "SECURITY_ALERT_WEBHOOK_URL": url})
