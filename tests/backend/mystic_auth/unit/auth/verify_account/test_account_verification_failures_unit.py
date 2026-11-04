"""Every failure path in the verification service degrades safely (False/None), never raises to the route."""
import pytest

from backend.mystic_auth.auth.verify_account.account_verification_service import (
    account_verification_service,
)

MODULE = "backend.mystic_auth.auth.verify_account.account_verification_service"


@pytest.mark.asyncio
async def test_send_verification_email_returns_false_when_the_cache_is_down(mocker):
    mocker.patch(f"{MODULE}.jwt_service.create_verification_token", return_value="tok")
    mocker.patch(f"{MODULE}.valkey_client.set", side_effect=ConnectionError("valkey down"))
    log = mocker.patch(f"{MODULE}.logger.error")
    assert await account_verification_service.send_verification_email("a@example.com") is False
    log.assert_called_once()


@pytest.mark.asyncio
async def test_send_if_needed_returns_false_on_a_database_error(mocker):
    mocker.patch(f"{MODULE}.user_crud.get_by_email", side_effect=RuntimeError("db down"))
    log = mocker.patch(f"{MODULE}.logger.error")
    assert await account_verification_service.send_verification_email_if_needed("a@example.com", db=None) is False
    log.assert_called_once()


@pytest.mark.asyncio
async def test_verify_token_returns_none_when_the_token_check_blows_up(mocker):
    mocker.patch(f"{MODULE}.jwt_service.verify_token", side_effect=RuntimeError("boom"))
    log = mocker.patch(f"{MODULE}.logger.error")
    assert await account_verification_service.verify_token("tok") is None
    log.assert_called_once()


@pytest.mark.asyncio
async def test_consume_token_fails_closed_when_the_cache_is_down(mocker):
    mocker.patch(f"{MODULE}.valkey_client.getdel", side_effect=ConnectionError("valkey down"))
    log = mocker.patch(f"{MODULE}.logger.error")
    assert await account_verification_service.consume_token("tok") is False
    log.assert_called_once()
