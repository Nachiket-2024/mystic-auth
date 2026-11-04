"""Revocation decisions found untested by mutation testing."""
import pytest

from backend.mystic_auth.auth.token_logic.jwt_service import jwt_service

BASE = {"type": "access", "email": "a@example.com", "chain": "c1", "jti": "j1", "account_ver": 3, "chain_ver": 2}


@pytest.fixture
def versions(mocker):
    mocker.patch.object(jwt_service, "get_account_version", return_value=3)
    mocker.patch.object(jwt_service, "get_chain_version", return_value=2)


@pytest.mark.asyncio
async def test_matching_versions_are_current(versions):
    assert await jwt_service.is_current_version(dict(BASE)) is True


@pytest.mark.asyncio
async def test_stale_account_version_is_rejected(versions):
    assert await jwt_service.is_current_version({**BASE, "account_ver": 2}) is False


@pytest.mark.asyncio
async def test_stale_chain_version_is_rejected(versions):
    assert await jwt_service.is_current_version({**BASE, "chain_ver": 1}) is False


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", [True, -1, "3", 3.0, None])
async def test_non_integer_or_negative_versions_are_rejected(versions, bad):
    assert await jwt_service.is_current_version({**BASE, "account_ver": bad}) is False
    assert await jwt_service.is_current_version({**BASE, "chain_ver": bad}) is False


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", ["email", "chain", "jti"])
async def test_access_token_missing_identity_is_rejected(versions, missing):
    payload = dict(BASE)
    del payload[missing]
    assert await jwt_service.is_current_version(payload) is False


@pytest.mark.asyncio
async def test_untyped_payload_without_email_is_not_version_checked(versions):
    assert await jwt_service.is_current_version({"type": "reset"}) is True
