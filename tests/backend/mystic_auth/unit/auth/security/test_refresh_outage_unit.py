import pytest

from backend.mystic_auth.auth.refresh_token_logic.refresh_token_service import (
    RefreshTokenService,
)
from backend.mystic_auth.auth.token_logic.jwt_service import jwt_service
from backend.mystic_auth.auth.token_logic.token_version_store import (
    TokenVersionUnavailableError,
)
from backend.mystic_auth.core.errors import AppError


@pytest.mark.asyncio
async def test_refresh_reports_store_outage_as_503_not_invalid(mocker):
    token = await jwt_service.create_refresh_token("r@example.com", "c", account_ver=0, chain_ver=0)
    mocker.patch.object(jwt_service, "is_token_revoked_by_jti", return_value=False)
    mocker.patch.object(jwt_service, "is_current_version", side_effect=TokenVersionUnavailableError("down"))
    with pytest.raises(AppError) as raised:
        await RefreshTokenService.refresh_tokens(token, db=None, request=None)
    assert raised.value.status_code == 503
