import pytest
from valkey.exceptions import ConnectionError as ValkeyConnectionError

from backend.mystic_auth.auth.token_logic.jwt_service import jwt_service
from backend.mystic_auth.auth.token_logic.token_version_store import (
    TokenVersionUnavailableError,
)
from backend.mystic_auth.core.errors import AppError


async def _token():
    return await jwt_service.create_access_token("outage@example.com", "c", account_ver=0, chain_ver=0)


@pytest.mark.asyncio
async def test_valkey_outage_is_503_not_invalid_token(mocker):
    token = await _token()
    mocker.patch.object(jwt_service, "is_token_revoked_by_jti", side_effect=ValkeyConnectionError("down"))
    with pytest.raises(AppError) as raised:
        await jwt_service.verify_token(token, expected_type="access")
    assert raised.value.status_code == 503


@pytest.mark.asyncio
async def test_postgres_outage_is_503_not_invalid_token(mocker):
    token = await _token()
    mocker.patch.object(jwt_service, "is_token_revoked_by_jti", return_value=False)
    mocker.patch.object(jwt_service, "is_current_version", side_effect=TokenVersionUnavailableError("down"))
    with pytest.raises(AppError) as raised:
        await jwt_service.verify_token(token, expected_type="access")
    assert raised.value.status_code == 503
    assert raised.value.headers == {"Retry-After": "5"}


@pytest.mark.asyncio
async def test_garbage_token_is_still_none():
    assert await jwt_service.verify_token("not-a-token", expected_type="access") is None
