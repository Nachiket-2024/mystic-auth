# Step-up ("confirm it's you") rules, against mocked Valkey, session rows, and password checks.
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.passkeys.passkey_step_up_handler import (
    PasskeyStepUpHandler,
)
from backend.mystic_auth.auth.token_logic.jwt_service import jwt_service
from backend.mystic_auth.user.user_crud_collector import user_crud

_DEFAULT_USER = SimpleNamespace(id=7)


def _step_up_env(monkeypatch, *, session, user=_DEFAULT_USER, payload=None, confirmed=0):
    from backend.mystic_auth.auth.passkeys import passkey_step_up_handler as module

    db = SimpleNamespace(scalar=AsyncMock(return_value=session))
    monkeypatch.setattr(
        jwt_service, "decode_payload", AsyncMock(return_value={"chain": "chain-1"} if payload is None else payload)
    )
    monkeypatch.setattr(user_crud, "get_by_email", AsyncMock(return_value=user))
    monkeypatch.setattr(module.valkey_client, "exists", AsyncMock(return_value=confirmed))
    return module, db


@pytest.mark.asyncio
async def test_step_up_accepts_a_fresh_login_without_prompting(monkeypatch):
    session = SimpleNamespace(created_at=datetime.now(UTC) - timedelta(minutes=14))
    module, db = _step_up_env(monkeypatch, session=session)

    await PasskeyStepUpHandler().require_step_up("user@example.com", "access-token", db)

    module.valkey_client.exists.assert_not_awaited()


@pytest.mark.asyncio
async def test_step_up_accepts_an_older_session_with_a_confirmation_marker(monkeypatch):
    session = SimpleNamespace(created_at=datetime.now(UTC) - timedelta(hours=3))
    module, db = _step_up_env(monkeypatch, session=session, confirmed=1)

    await PasskeyStepUpHandler().require_step_up("user@example.com", "access-token", db)

    module.valkey_client.exists.assert_awaited_once_with("passkey_stepup:chain-1")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("payload", "user", "session", "confirmed"),
    [
        ({}, SimpleNamespace(id=7), None, 0),
        (None, None, None, 0),
        (None, SimpleNamespace(id=7), None, 1),
        (None, SimpleNamespace(id=7), SimpleNamespace(created_at=datetime.now(UTC) - timedelta(hours=1)), 0),
    ],
)
async def test_step_up_required_without_session_or_confirmation(monkeypatch, payload, user, session, confirmed):
    from backend.mystic_auth.core.errors import AppError

    _, db = _step_up_env(monkeypatch, session=session, user=user, payload=payload, confirmed=confirmed)

    with pytest.raises(AppError) as error:
        await PasskeyStepUpHandler().require_step_up("user@example.com", "access-token", db)

    assert error.value.status_code == 403
    assert error.value.code == "PASSKEY_STEP_UP_REQUIRED"


@pytest.mark.asyncio
async def test_step_up_fails_closed_when_valkey_is_down(monkeypatch):
    from backend.mystic_auth.core.errors import AppError

    session = SimpleNamespace(created_at=datetime.now(UTC) - timedelta(hours=1))
    module, db = _step_up_env(monkeypatch, session=session)
    module.valkey_client.exists.side_effect = RuntimeError("down")

    with pytest.raises(AppError) as error:
        await PasskeyStepUpHandler().require_step_up("user@example.com", "access-token", db)

    assert error.value.code == "PASSKEY_STEP_UP_REQUIRED"


def _confirm_env(monkeypatch, *, hashed="hash", password_ok=True, allowed=True):
    from backend.mystic_auth.auth.passkeys import passkey_step_up_handler as module

    user = SimpleNamespace(id=7, email="user@example.com", hashed_password=hashed)
    session = SimpleNamespace(created_at=datetime.now(UTC) - timedelta(hours=1))
    db = SimpleNamespace(scalar=AsyncMock(return_value=session))
    monkeypatch.setattr(jwt_service, "decode_payload", AsyncMock(return_value={"chain": "chain-1"}))
    monkeypatch.setattr(user_crud, "get_by_email", AsyncMock(return_value=user))
    monkeypatch.setattr(module, "log_security_event", AsyncMock())
    monkeypatch.setattr(module, "capture_security_alert", AsyncMock())
    monkeypatch.setattr(module.valkey_client, "set", AsyncMock())
    monkeypatch.setattr(module.password_service, "verify_password", AsyncMock(return_value=password_ok))
    protection = module.login_protection_service
    monkeypatch.setattr(protection, "is_locked", AsyncMock(return_value=False))
    monkeypatch.setattr(protection, "check_and_record_action", AsyncMock(return_value=allowed))
    monkeypatch.setattr(protection, "reset_failed_attempts", AsyncMock())
    monkeypatch.setattr(protection, "get_remaining_seconds", AsyncMock(return_value=120))
    return module, db, user


@pytest.mark.asyncio
async def test_password_confirmation_sets_a_fifteen_minute_marker(monkeypatch):
    module, db, _ = _confirm_env(monkeypatch)

    result = await PasskeyStepUpHandler().confirm_with_password("user@example.com", "tok", "pw", _request(), db)

    assert result["expires_in"] == 900
    module.valkey_client.set.assert_awaited_once_with("passkey_stepup:chain-1", "1", ex=900)
    module.login_protection_service.reset_failed_attempts.assert_awaited_once()


@pytest.mark.asyncio
async def test_wrong_password_is_rejected_and_sets_no_marker(monkeypatch):
    from backend.mystic_auth.core.errors import AppError

    module, db, _ = _confirm_env(monkeypatch, password_ok=False)

    with pytest.raises(AppError) as error:
        await PasskeyStepUpHandler().confirm_with_password("user@example.com", "tok", "bad", _request(), db)

    assert error.value.code == "CURRENT_PASSWORD_INCORRECT"
    module.valkey_client.set.assert_not_awaited()


@pytest.mark.asyncio
async def test_repeated_wrong_passwords_lock_out_with_retry_after(monkeypatch):
    from backend.mystic_auth.core.errors import AppError

    module, db, _ = _confirm_env(monkeypatch, password_ok=False, allowed=False)

    with pytest.raises(AppError) as error:
        await PasskeyStepUpHandler().confirm_with_password("user@example.com", "tok", "bad", _request(), db)

    assert error.value.status_code == 429
    assert error.value.headers["Retry-After"] == "120"
    module.capture_security_alert.assert_awaited_once()


@pytest.mark.asyncio
async def test_password_confirmation_unavailable_for_passwordless_accounts(monkeypatch):
    from backend.mystic_auth.core.errors import AppError

    _, db, _ = _confirm_env(monkeypatch, hashed=None)

    with pytest.raises(AppError) as error:
        await PasskeyStepUpHandler().confirm_with_password("user@example.com", "tok", "pw", _request(), db)

    assert error.value.code == "PASSKEY_STEP_UP_PASSWORD_UNAVAILABLE"


@pytest.mark.asyncio
@pytest.mark.parametrize("owner_id", [7, 99])
async def test_passkey_confirmation_must_belong_to_the_signed_in_user(monkeypatch, owner_id):
    from backend.mystic_auth.core.errors import AppError

    module, db, _ = _confirm_env(monkeypatch)
    from backend.mystic_auth.auth.passkeys import passkey_origin

    monkeypatch.setattr(passkey_origin.settings, "WEBAUTHN_ORIGINS", "http://localhost:5173")
    monkeypatch.setattr(
        module.passkey_service, "finish_authentication", AsyncMock(return_value=SimpleNamespace(id=owner_id))
    )

    if owner_id == 7:
        result = await PasskeyStepUpHandler().confirm_with_passkey("user@example.com", "tok", {}, _request(), db)
        assert result["detail"] == "Confirmed"
    else:
        with pytest.raises(AppError) as error:
            await PasskeyStepUpHandler().confirm_with_passkey("user@example.com", "tok", {}, _request(), db)
        assert error.value.code == "PASSKEY_STEP_UP_FAILED"
        module.valkey_client.set.assert_not_awaited()


def _request():
    return SimpleNamespace(
        headers={"origin": "http://localhost:5173"},
        client=SimpleNamespace(host="203.0.113.9"),
        state=SimpleNamespace(request_id="r1"),
    )
