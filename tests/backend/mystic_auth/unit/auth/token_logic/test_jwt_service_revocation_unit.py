# Version-based revocation and issuer/audience claim enforcement for
# jwt_service. Revocation is entirely version-based: a token is valid
# only if its embedded account_ver and chain_ver still match Valkey's
# current values. bump_account_version/bump_chain_version are what an
# actual revoke calls (see refresh_token_service.py); these tests cover
# the read/write/compare primitives in isolation, plus the JWT_ISSUER/
# JWT_AUDIENCE claims verify_token enforces alongside them. See
# test_jwt_service_unit.py for token creation/type-enforcement coverage.
from unittest.mock import AsyncMock

import jwt as pyjwt
import pytest

from backend.mystic_auth.auth.token_logic.jwt_service import jwt_service
from backend.mystic_auth.auth.token_logic.token_revocation_keys import (
    account_version_key,
    chain_version_key,
    legacy_account_version_key,
    legacy_chain_version_key,
)
from backend.mystic_auth.auth.token_logic.token_version_store import token_version_store
from backend.mystic_auth.core.settings import settings

MODULE = "backend.mystic_auth.auth.token_logic.jwt_service"


def _decode(token: str) -> dict:
    return pyjwt.decode(
        token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM], audience=settings.JWT_AUDIENCE
    )


def _mock_no_versions(mocker):
    mocker.patch.object(jwt_service, "get_token_versions", new_callable=AsyncMock, return_value=(0, 0))


@pytest.mark.asyncio
async def test_get_account_version_defaults_to_zero_when_never_bumped(mocker):
    mocker.patch.object(token_version_store, "_get_version", new_callable=AsyncMock, return_value=0)

    assert await jwt_service.get_account_version("user@example.com") == 0


@pytest.mark.asyncio
async def test_get_account_version_reads_the_stored_integer(mocker):
    mocker.patch.object(token_version_store, "_get_version", new_callable=AsyncMock, return_value=7)

    assert await jwt_service.get_account_version("user@example.com") == 7


@pytest.mark.asyncio
async def test_get_chain_version_defaults_to_zero_when_never_bumped(mocker):
    mocker.patch.object(token_version_store, "_get_version", new_callable=AsyncMock, return_value=0)

    assert await jwt_service.get_chain_version("user@example.com", "chain-1") == 0


@pytest.mark.asyncio
async def test_bump_account_version_increments_the_key(mocker):
    bump_mock = mocker.patch.object(token_version_store, "_bump_version", new_callable=AsyncMock, return_value=1)

    await jwt_service.bump_account_version("user@example.com")

    bump_mock.assert_awaited_once_with(account_version_key("user@example.com"), legacy_account_version_key("user@example.com"))


@pytest.mark.asyncio
async def test_bump_chain_version_increments_and_sets_a_ttl(mocker):
    bump_mock = mocker.patch.object(token_version_store, "_bump_version", new_callable=AsyncMock, return_value=1)

    await jwt_service.bump_chain_version("user@example.com", "chain-1")

    bump_mock.assert_awaited_once_with(chain_version_key("user@example.com", "chain-1"), legacy_chain_version_key("user@example.com", "chain-1"))
    # TTL'd to the refresh-token lifetime: nothing could still be validly
    # using this chain_id after that elapses anyway, so the key can
    # safely expire instead of accumulating one per revoked session
    # forever.



@pytest.mark.asyncio
async def test_verify_token_rejects_a_token_whose_account_version_is_stale(mocker):
    mocker.patch(f"{MODULE}.JWTService.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)
    # Minted with account_ver=0 (nothing bumped yet)...
    mocker.patch.object(jwt_service, "get_token_versions", new_callable=AsyncMock, return_value=(0, 0))
    token = await jwt_service.create_access_token(email="user@example.com", chain_id="chain-1")

    # ...then the account is revoked (bumped to 1) before the token is used.
    mocker.patch.object(jwt_service, "get_account_version", new_callable=AsyncMock, return_value=1)

    assert await jwt_service.verify_token(token, expected_type="access") is None


@pytest.mark.asyncio
async def test_verify_token_accepts_a_token_minted_after_the_account_bump(mocker):
    """A token minted (e.g. by logging back in) after a revoke event must
    still work: the version is a fixed point in time, not a blanket ban
    on the account."""
    mocker.patch(f"{MODULE}.JWTService.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)
    # Minted after the account was already bumped to version 1.
    mocker.patch.object(jwt_service, "get_token_versions", new_callable=AsyncMock, return_value=(1, 1))
    mocker.patch.object(jwt_service, "get_account_version", new_callable=AsyncMock, return_value=1)
    mocker.patch.object(jwt_service, "get_chain_version", new_callable=AsyncMock, return_value=1)

    token = await jwt_service.create_access_token(email="user@example.com", chain_id="chain-1")
    payload = await jwt_service.verify_token(token, expected_type="access")

    assert payload is not None
    assert payload["email"] == "user@example.com"


@pytest.mark.asyncio
async def test_verify_token_rejects_a_token_whose_chain_version_is_stale(mocker):
    mocker.patch(f"{MODULE}.JWTService.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)
    mocker.patch.object(jwt_service, "get_token_versions", new_callable=AsyncMock, return_value=(0, 0))
    token = await jwt_service.create_refresh_token(email="user@example.com", chain_id="chain-1")

    # Only this one chain gets revoked: a different, unrelated chain on
    # the same account would read a version of 0 and stay unaffected.
    mocker.patch.object(jwt_service, "get_account_version", new_callable=AsyncMock, return_value=0)
    mocker.patch.object(jwt_service, "get_chain_version", new_callable=AsyncMock, return_value=1)

    assert await jwt_service.verify_token(token, expected_type="refresh") is None


@pytest.mark.asyncio
async def test_verify_token_rejects_versionless_access_token(mocker):
    """Access tokens without revocation snapshots cannot survive logout-all."""
    mocker.patch(f"{MODULE}.JWTService.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)

    untyped_token = pyjwt.encode(
        {
            "email": "user@example.com", "type": "access", "jti": "legacy-jti", "chain": "legacy-chain",
            "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE, "exp": 4_000_000_000,
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    payload = await jwt_service.verify_token(untyped_token, expected_type="access")

    assert payload is None


@pytest.mark.asyncio
async def test_create_access_token_embeds_issuer_and_audience(mocker):
    _mock_no_versions(mocker)

    token = await jwt_service.create_access_token(email="user@example.com", chain_id="chain-1")

    payload = _decode(token)
    assert payload["iss"] == settings.JWT_ISSUER
    assert payload["aud"] == settings.JWT_AUDIENCE


@pytest.mark.asyncio
async def test_verify_token_rejects_a_token_with_no_issuer_or_audience_claims(mocker):
    """App credentials must identify the issuing deployment and consumer."""
    mocker.patch(f"{MODULE}.JWTService.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)

    token = pyjwt.encode(
        {
            "email": "user@example.com", "type": "access", "jti": "legacy-jti", "chain": "legacy-chain",
            "account_ver": 0, "chain_ver": 0, "exp": 4_000_000_000,
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    assert await jwt_service.verify_token(token, expected_type="access") is None


@pytest.mark.asyncio
async def test_verify_token_rejects_a_token_with_the_wrong_issuer(mocker):
    _mock_no_versions(mocker)
    mocker.patch(f"{MODULE}.JWTService.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)

    token = pyjwt.encode(
        {
            "email": "user@example.com", "type": "access", "jti": "jti-1", "chain": "chain-1",
            "account_ver": 0, "chain_ver": 0, "aud": settings.JWT_AUDIENCE,
            "iss": "https://some-other-deployment.example", "exp": 4_000_000_000,
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    assert await jwt_service.verify_token(token, expected_type="access") is None


@pytest.mark.asyncio
async def test_verify_token_rejects_a_token_with_the_wrong_audience(mocker):
    _mock_no_versions(mocker)
    mocker.patch(f"{MODULE}.JWTService.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)

    token = pyjwt.encode(
        {
            "email": "user@example.com", "type": "access", "jti": "jti-1", "chain": "chain-1",
            "account_ver": 0, "chain_ver": 0, "iss": settings.JWT_ISSUER,
            "aud": "https://some-other-consumer.example", "exp": 4_000_000_000,
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    assert await jwt_service.verify_token(token, expected_type="access") is None
