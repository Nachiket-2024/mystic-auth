# tests/backend/mystic_auth/unit/auth/token_logic/test_token_version_store_unit.py
#
# bump_account_version/bump_chain_version's own success/failure contract in
# isolation: True once the Redis INCR is confirmed, False (never a swallowed
# exception) when Redis is unreachable. See refresh_token_service_unit tests
# and session_service tests for how callers act on that signal.
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.token_logic.token_version_store import token_version_store

MODULE = "backend.mystic_auth.auth.token_logic.token_version_store"


@pytest.mark.asyncio
async def test_bump_account_version_returns_true_on_success(mocker):
    mocker.patch(f"{MODULE}.redis_client.incr", new_callable=AsyncMock)

    assert await token_version_store.bump_account_version("user@example.com") is True


@pytest.mark.asyncio
async def test_bump_account_version_returns_false_when_redis_is_unreachable(mocker):
    mocker.patch(f"{MODULE}.redis_client.incr", new_callable=AsyncMock, side_effect=ConnectionError("down"))

    assert await token_version_store.bump_account_version("user@example.com") is False


@pytest.mark.asyncio
async def test_bump_chain_version_returns_true_on_success(mocker):
    mocker.patch(f"{MODULE}.redis_client.incr", new_callable=AsyncMock)
    mocker.patch(f"{MODULE}.redis_client.expire", new_callable=AsyncMock)

    assert await token_version_store.bump_chain_version("user@example.com", "chain-1") is True


@pytest.mark.asyncio
async def test_bump_chain_version_returns_false_when_incr_fails(mocker):
    mocker.patch(f"{MODULE}.redis_client.incr", new_callable=AsyncMock, side_effect=ConnectionError("down"))
    expire_mock = mocker.patch(f"{MODULE}.redis_client.expire", new_callable=AsyncMock)

    assert await token_version_store.bump_chain_version("user@example.com", "chain-1") is False
    # Never reached: the TTL is meaningless on a key that was never
    # actually incremented.
    expire_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_bump_chain_version_returns_false_when_expire_fails(mocker):
    mocker.patch(f"{MODULE}.redis_client.incr", new_callable=AsyncMock)
    mocker.patch(f"{MODULE}.redis_client.expire", new_callable=AsyncMock, side_effect=ConnectionError("down"))

    assert await token_version_store.bump_chain_version("user@example.com", "chain-1") is False


@pytest.mark.asyncio
async def test_bump_account_version_failure_does_not_raise(mocker):
    """The bump primitives themselves stay non-raising (return bool) -
    it's their callers (refresh_token_service, session_service) that turn a
    False into TokenVersionUnavailableError, not this class."""
    mocker.patch(f"{MODULE}.redis_client.incr", new_callable=AsyncMock, side_effect=ConnectionError("down"))

    result = await token_version_store.bump_account_version("user@example.com")

    assert result is False
