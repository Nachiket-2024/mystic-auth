"""Edge and failure paths of the reset flow: all of them refuse safely and keep the link usable where fair."""
import time
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.password_logic.password_reset_service import (
    password_reset_service,
)

MODULE = "backend.mystic_auth.auth.password_logic.password_reset_service"


class _User:
    hashed_password = "old-hash"


def _valid_payload(**extra):
    return {"jti": "j1", "email": "user@example.com", "exp": time.time() + 600, **extra}


@pytest.mark.asyncio
async def test_store_reset_token_refuses_a_token_without_a_unique_id(mocker):
    mocker.patch(f"{MODULE}.password_service.verify_reset_token", return_value={"email": "a@example.com"})
    eval_mock = mocker.patch(f"{MODULE}.valkey_client.eval", new_callable=AsyncMock)
    assert await password_reset_service.store_reset_token("a@example.com", "tok", 60) is False
    eval_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_send_reset_email_fails_closed_when_the_new_token_cannot_be_stored(mocker):
    mocker.patch(f"{MODULE}.user_crud.get_by_email", return_value=_User())
    mocker.patch(f"{MODULE}.password_service.create_reset_token", return_value="tok")
    mocker.patch(f"{MODULE}.password_service.verify_reset_token", return_value=None)
    send = mocker.patch(f"{MODULE}.send_email_task.defer_async", new_callable=AsyncMock)
    mocker.patch(f"{MODULE}.logger.error")
    assert await password_reset_service.send_reset_email("user@example.com", db=None) is False
    send.assert_not_awaited()


@pytest.mark.asyncio
async def test_reset_password_rejects_a_token_with_no_unique_id_or_email(mocker):
    mocker.patch(f"{MODULE}.password_service.verify_reset_token", return_value={"exp": time.time() + 60})
    assert await password_reset_service.reset_password("tok", "NewPass!2026aa", db=None) == (False, None)


@pytest.mark.asyncio
async def test_reset_password_for_a_vanished_user_restores_the_link_and_fails(mocker):
    mocker.patch(f"{MODULE}.password_service.verify_reset_token", return_value=_valid_payload())
    eval_mock = mocker.patch(f"{MODULE}.valkey_client.eval", new_callable=AsyncMock, return_value=1)
    mocker.patch(f"{MODULE}.password_service.validate_password_strength", return_value=True)
    mocker.patch(f"{MODULE}.user_crud.get_by_email", return_value=None)
    assert await password_reset_service.reset_password("tok", "NewPass!2026aa", db=None) == (False, None)
    # one eval to consume the link, a second to put it back
    assert eval_mock.await_count == 2


@pytest.mark.asyncio
async def test_reset_password_does_not_restore_a_token_that_has_no_expiry(mocker):
    payload = _valid_payload()
    payload.pop("exp")
    mocker.patch(f"{MODULE}.password_service.verify_reset_token", return_value=payload)
    eval_mock = mocker.patch(f"{MODULE}.valkey_client.eval", new_callable=AsyncMock, return_value=1)
    mocker.patch(f"{MODULE}.password_service.validate_password_strength", return_value=False)
    assert await password_reset_service.reset_password("tok", "weak", db=None) == (False, None)
    assert eval_mock.await_count == 1  # consumed, nothing to restore


@pytest.mark.asyncio
async def test_reset_password_swallows_an_unexpected_error(mocker):
    mocker.patch(f"{MODULE}.password_service.verify_reset_token", side_effect=RuntimeError("boom"))
    log = mocker.patch(f"{MODULE}.logger.error")
    assert await password_reset_service.reset_password("tok", "NewPass!2026aa", db=None) == (False, None)
    log.assert_called_once()
