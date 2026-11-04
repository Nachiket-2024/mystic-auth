# Passkey sign-in lockout and credential helpers, against mocked services.
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from backend.mystic_auth.auth.passkeys.passkey_handler import PasskeyHandler


def _request():
    return SimpleNamespace(
        headers={"origin": "http://localhost:5173"},
        client=SimpleNamespace(host="203.0.113.9"),
        state=SimpleNamespace(request_id="r1"),
    )


@pytest.mark.asyncio
async def test_authentication_rejects_while_source_ip_is_locked(monkeypatch):
    from backend.mystic_auth.auth.passkeys import passkey_handler as module

    monkeypatch.setattr(module.settings, "WEBAUTHN_ORIGINS", "http://localhost:5173")
    monkeypatch.setattr(module, "log_security_event", AsyncMock())
    monkeypatch.setattr(module.login_protection_service, "is_locked", AsyncMock(return_value=True))
    monkeypatch.setattr(module.login_protection_service, "get_remaining_seconds", AsyncMock(return_value=90))
    verify = AsyncMock()
    monkeypatch.setattr(module.passkey_service, "finish_authentication", verify)

    response = await PasskeyHandler().complete_authentication({}, _request(), SimpleNamespace())

    assert response.status_code == 429
    assert response.headers["retry-after"] == "90"
    verify.assert_not_awaited()


@pytest.mark.asyncio
async def test_failed_authentication_records_attempt_and_alerts_on_lockout(monkeypatch):
    from backend.mystic_auth.auth.passkeys import passkey_handler as module

    monkeypatch.setattr(module.settings, "WEBAUTHN_ORIGINS", "http://localhost:5173")
    monkeypatch.setattr(module, "log_security_event", AsyncMock())
    alert = AsyncMock()
    monkeypatch.setattr(module, "capture_security_alert", alert)
    monkeypatch.setattr(module.login_protection_service, "is_locked", AsyncMock(return_value=False))
    monkeypatch.setattr(module.login_protection_service, "check_and_record_action", AsyncMock(return_value=False))
    monkeypatch.setattr(module.login_protection_service, "get_remaining_seconds", AsyncMock(return_value=30))
    monkeypatch.setattr(module.passkey_service, "finish_authentication", AsyncMock(return_value=None))

    response = await PasskeyHandler().complete_authentication({}, _request(), SimpleNamespace())

    assert response.status_code == 429
    alert.assert_awaited_once()


@pytest.mark.asyncio
async def test_failed_authentication_below_threshold_is_plain_401(monkeypatch):
    from backend.mystic_auth.auth.passkeys import passkey_handler as module

    monkeypatch.setattr(module.settings, "WEBAUTHN_ORIGINS", "http://localhost:5173")
    monkeypatch.setattr(module, "log_security_event", AsyncMock())
    monkeypatch.setattr(module.login_protection_service, "is_locked", AsyncMock(return_value=False))
    monkeypatch.setattr(module.login_protection_service, "check_and_record_action", AsyncMock(return_value=True))
    monkeypatch.setattr(module.passkey_service, "finish_authentication", AsyncMock(return_value=None))

    with pytest.raises(HTTPException) as error:
        await PasskeyHandler().complete_authentication({}, _request(), SimpleNamespace())

    assert error.value.status_code == 401


def test_transports_are_filtered_to_known_values():
    from backend.mystic_auth.auth.passkeys.passkey_service import _clean_transports

    assert _clean_transports(["usb", "evil", 5, {"x": 1}, "usb", "hybrid"]) == ["hybrid", "usb"]
    assert _clean_transports("usb") == []
    assert _clean_transports(None) == []


def test_lock_keys_use_the_shape_the_rate_limits_dashboard_can_list_and_reset():
    from backend.mystic_auth.auth.passkeys.passkey_step_up_handler import (
        PasskeyStepUpHandler,
    )
    from backend.mystic_auth.auth.security.rate_limiting.rate_limit_dashboard_service import (
        RateLimitDashboardService,
    )

    login_key = PasskeyHandler._lock_key("203.0.113.9")
    step_up_key = PasskeyStepUpHandler()._step_up_lock_key("User@Example.com", _request())

    for key in (login_key, step_up_key):
        assert RateLimitDashboardService._is_rate_limit_key(key)
        assert key.startswith("login_lock:")
    assert "203.0.113.9" not in login_key  # keyed digest, never a raw IP
    assert PasskeyHandler._lock_key("203.0.113.10") != login_key
