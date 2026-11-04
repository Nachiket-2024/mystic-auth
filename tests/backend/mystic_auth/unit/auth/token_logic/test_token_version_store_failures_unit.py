"""The durable token-version store fails closed: reads raise, bumps report False."""
import pytest

from backend.mystic_auth.auth.token_logic.token_version_store import (
    TokenVersionUnavailableError,
    token_version_store,
)

MODULE = "backend.mystic_auth.auth.token_logic.token_version_store"


@pytest.fixture
def broken_database(mocker):
    mocker.patch(f"{MODULE}.database.async_session", side_effect=ConnectionError("postgres down"))
    return mocker.patch(f"{MODULE}.logger.error")


@pytest.mark.asyncio
async def test_get_versions_raises_when_the_database_is_down(broken_database):
    with pytest.raises(TokenVersionUnavailableError, match="token revocation"):
        await token_version_store.get_versions("a@example.com", "chain-1")
    broken_database.assert_called_once()


@pytest.mark.asyncio
async def test_get_account_version_raises_when_the_database_is_down(broken_database):
    with pytest.raises(TokenVersionUnavailableError, match="account revocation"):
        await token_version_store.get_account_version("a@example.com")


@pytest.mark.asyncio
async def test_get_chain_version_raises_when_the_database_is_down(broken_database):
    with pytest.raises(TokenVersionUnavailableError, match="chain revocation"):
        await token_version_store.get_chain_version("a@example.com", "chain-1")


@pytest.mark.asyncio
async def test_bump_chain_version_reports_failure_instead_of_pretending_it_revoked(broken_database):
    assert await token_version_store.bump_chain_version("a@example.com", "chain-1") is False
    broken_database.assert_called_once()


@pytest.mark.asyncio
async def test_bump_account_version_reports_failure_instead_of_pretending_it_revoked(broken_database):
    assert await token_version_store.bump_account_version("a@example.com") is False
