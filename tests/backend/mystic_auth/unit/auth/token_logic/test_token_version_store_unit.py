# bump_account_version/bump_chain_version's own success/failure contract:
# True once the Valkey INCR is confirmed, False (never a swallowed
# exception) when Valkey is unreachable. See the refresh_token_service and
# session_service tests for how callers act on that signal.
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.token_logic.token_version_store import (
    ACCOUNT_VERSION_KEY,
    CHAIN_VERSION_KEY,
    token_version_store,
)
from backend.mystic_auth.core.settings import settings

MODULE = "backend.mystic_auth.auth.token_logic.token_version_store"


@pytest.mark.asyncio
async def test_get_account_version_returns_zero_when_key_is_missing(mocker):
    get_mock = mocker.patch(f"{MODULE}.valkey_client.get", new_callable=AsyncMock, return_value=None)

    assert await token_version_store.get_account_version("user@example.com") == 0
    get_mock.assert_awaited_once_with(ACCOUNT_VERSION_KEY.format(email="user@example.com"))


@pytest.mark.asyncio
async def test_get_account_version_converts_valkey_string_to_int(mocker):
    mocker.patch(f"{MODULE}.valkey_client.get", new_callable=AsyncMock, return_value="7")

    assert await token_version_store.get_account_version("user@example.com") == 7


@pytest.mark.asyncio
async def test_get_account_version_fails_open_when_valkey_or_value_is_invalid(mocker):
    mocker.patch(f"{MODULE}.valkey_client.get", new_callable=AsyncMock, side_effect=ConnectionError("down"))
    assert await token_version_store.get_account_version("user@example.com") == 0

    mocker.patch(f"{MODULE}.valkey_client.get", new_callable=AsyncMock, return_value="not-an-integer")
    assert await token_version_store.get_account_version("user@example.com") == 0


@pytest.mark.asyncio
async def test_get_chain_version_returns_value_for_the_expected_chain_key(mocker):
    get_mock = mocker.patch(f"{MODULE}.valkey_client.get", new_callable=AsyncMock, return_value="3")

    assert await token_version_store.get_chain_version("user@example.com", "chain-1") == 3
    get_mock.assert_awaited_once_with(CHAIN_VERSION_KEY.format(email="user@example.com", chain_id="chain-1"))


@pytest.mark.asyncio
async def test_get_chain_version_fails_open_when_valkey_is_unavailable(mocker):
    mocker.patch(f"{MODULE}.valkey_client.get", new_callable=AsyncMock, side_effect=ConnectionError("down"))

    assert await token_version_store.get_chain_version("user@example.com", "chain-1") == 0


@pytest.mark.asyncio
async def test_bump_account_version_returns_true_on_success(mocker):
    incr_mock = mocker.patch(f"{MODULE}.valkey_client.incr", new_callable=AsyncMock)

    assert await token_version_store.bump_account_version("user@example.com") is True
    incr_mock.assert_awaited_once_with(ACCOUNT_VERSION_KEY.format(email="user@example.com"))


@pytest.mark.asyncio
async def test_bump_account_version_returns_false_when_valkey_is_unreachable(mocker):
    mocker.patch(f"{MODULE}.valkey_client.incr", new_callable=AsyncMock, side_effect=ConnectionError("down"))

    assert await token_version_store.bump_account_version("user@example.com") is False


@pytest.mark.asyncio
async def test_bump_chain_version_returns_true_on_success(mocker):
    incr_mock = mocker.patch(f"{MODULE}.valkey_client.incr", new_callable=AsyncMock)
    expire_mock = mocker.patch(f"{MODULE}.valkey_client.expire", new_callable=AsyncMock)

    assert await token_version_store.bump_chain_version("user@example.com", "chain-1") is True
    key = CHAIN_VERSION_KEY.format(email="user@example.com", chain_id="chain-1")
    incr_mock.assert_awaited_once_with(key)
    expire_mock.assert_awaited_once_with(key, settings.REFRESH_TOKEN_EXPIRE_MINUTES * 60)


@pytest.mark.asyncio
async def test_bump_chain_version_returns_false_when_incr_fails(mocker):
    mocker.patch(f"{MODULE}.valkey_client.incr", new_callable=AsyncMock, side_effect=ConnectionError("down"))
    expire_mock = mocker.patch(f"{MODULE}.valkey_client.expire", new_callable=AsyncMock)

    assert await token_version_store.bump_chain_version("user@example.com", "chain-1") is False
    # Never reached: the TTL is meaningless on a key that was never
    # actually incremented.
    expire_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_bump_chain_version_returns_false_when_expire_fails(mocker):
    mocker.patch(f"{MODULE}.valkey_client.incr", new_callable=AsyncMock)
    mocker.patch(f"{MODULE}.valkey_client.expire", new_callable=AsyncMock, side_effect=ConnectionError("down"))

    assert await token_version_store.bump_chain_version("user@example.com", "chain-1") is False


@pytest.mark.asyncio
async def test_bump_account_version_failure_does_not_raise(mocker):
    """The bump primitives themselves stay non-raising (return bool); it's
    their callers (refresh_token_service, session_service) that turn a
    False into TokenVersionUnavailableError, not this class."""
    mocker.patch(f"{MODULE}.valkey_client.incr", new_callable=AsyncMock, side_effect=ConnectionError("down"))

    result = await token_version_store.bump_account_version("user@example.com")

    assert result is False
