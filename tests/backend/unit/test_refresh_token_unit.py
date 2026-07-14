# tests/backend/unit/test_refresh_token.py
import pytest
from unittest.mock import AsyncMock

from backend.app.auth.refresh_token_logic.refresh_token_service import refresh_token_service


MODULE = "backend.app.auth.refresh_token_logic.refresh_token_service.jwt_service"


@pytest.mark.asyncio
async def test_refresh_tokens_rotates_on_valid_unused_token(mocker):
    decode_mock = mocker.patch(
        f"{MODULE}.decode_payload",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "user", "type": "refresh", "jti": "jti-1", "exp": 123},
    )
    mocker.patch(f"{MODULE}.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)
    revoke_mock = mocker.patch(f"{MODULE}.revoke_token_by_jti", new_callable=AsyncMock, return_value=True)
    mocker.patch(f"{MODULE}.create_access_token", new_callable=AsyncMock, return_value="new-access")
    mocker.patch(f"{MODULE}.create_refresh_token", new_callable=AsyncMock, return_value="new-refresh")

    result = await refresh_token_service.refresh_tokens("old-refresh-token")

    assert result == {"access_token": "new-access", "refresh_token": "new-refresh"}
    # The token must be decoded exactly once for the whole rotation, not
    # re-decoded separately to check revocation/type and again to revoke it.
    decode_mock.assert_awaited_once_with("old-refresh-token")
    revoke_mock.assert_awaited_once_with("jti-1", 123, "user@example.com")


@pytest.mark.asyncio
async def test_refresh_tokens_rejects_undecodable_token(mocker):
    mocker.patch(f"{MODULE}.decode_payload", new_callable=AsyncMock, return_value=None)
    is_revoked_mock = mocker.patch(f"{MODULE}.is_token_revoked_by_jti", new_callable=AsyncMock)

    result = await refresh_token_service.refresh_tokens("bad-token")

    assert result is None
    # An expired/malformed token never decodes, so there's no jti to even
    # check revocation for.
    is_revoked_mock.assert_not_called()


@pytest.mark.asyncio
async def test_refresh_tokens_rotates_for_roleless_account(mocker):
    # Every OAuth2-created account (oauth2_service.py) is created with
    # role=None, so its refresh tokens carry no "role" claim at all. Role
    # must stay optional here — only email is required — or every such
    # account would be silently unable to refresh once its access token expired.
    decode_mock = mocker.patch(
        f"{MODULE}.decode_payload",
        new_callable=AsyncMock,
        return_value={"email": "oauth-user@example.com", "role": None, "type": "refresh", "jti": "jti-2", "exp": 456},
    )
    mocker.patch(f"{MODULE}.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)
    mocker.patch(f"{MODULE}.revoke_token_by_jti", new_callable=AsyncMock, return_value=True)
    create_access_mock = mocker.patch(f"{MODULE}.create_access_token", new_callable=AsyncMock, return_value="new-access")
    create_refresh_mock = mocker.patch(f"{MODULE}.create_refresh_token", new_callable=AsyncMock, return_value="new-refresh")

    result = await refresh_token_service.refresh_tokens("roleless-refresh-token")

    assert result == {"access_token": "new-access", "refresh_token": "new-refresh"}
    decode_mock.assert_awaited_once_with("roleless-refresh-token")
    create_access_mock.assert_awaited_once_with("oauth-user@example.com", None)
    create_refresh_mock.assert_awaited_once_with("oauth-user@example.com", None)


@pytest.mark.asyncio
async def test_refresh_tokens_rejects_wrong_type_token_without_treating_it_as_reuse(mocker):
    mocker.patch(
        f"{MODULE}.decode_payload",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "user", "type": "access", "jti": "jti-1", "exp": 123},
    )
    mocker.patch(f"{MODULE}.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=False)
    revoke_all_mock = mocker.patch(
        "backend.app.auth.refresh_token_logic.refresh_token_service.RefreshTokenService.revoke_all_tokens_for_user",
        new_callable=AsyncMock,
    )

    result = await refresh_token_service.refresh_tokens("access-token-used-as-refresh")

    assert result is None
    # A wrong-type token (but not a *revoked* one) is just rejected, not
    # treated as reuse — no session-wide revocation should be triggered.
    revoke_all_mock.assert_not_called()


@pytest.mark.asyncio
async def test_refresh_tokens_reuse_of_revoked_token_revokes_all_sessions(mocker):
    decode_mock = mocker.patch(
        f"{MODULE}.decode_payload",
        new_callable=AsyncMock,
        return_value={"email": "victim@example.com", "jti": "stolen-jti"},
    )
    mocker.patch(f"{MODULE}.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=True)
    revoke_all_mock = mocker.patch(
        "backend.app.auth.refresh_token_logic.refresh_token_service.RefreshTokenService.revoke_all_tokens_for_user",
        new_callable=AsyncMock,
        return_value=3,
    )
    create_access_mock = mocker.patch(f"{MODULE}.create_access_token", new_callable=AsyncMock)

    result = await refresh_token_service.refresh_tokens("stolen-and-replayed-token")

    assert result is None
    decode_mock.assert_awaited_once_with("stolen-and-replayed-token")
    revoke_all_mock.assert_awaited_once_with("victim@example.com")
    # A reused token must never proceed to rotation once it's been
    # identified as already-revoked.
    create_access_mock.assert_not_called()


@pytest.mark.asyncio
async def test_refresh_tokens_reuse_with_missing_email_does_not_crash(mocker):
    mocker.patch(
        f"{MODULE}.decode_payload",
        new_callable=AsyncMock,
        return_value={"jti": "stolen-jti"},
    )
    mocker.patch(f"{MODULE}.is_token_revoked_by_jti", new_callable=AsyncMock, return_value=True)
    revoke_all_mock = mocker.patch(
        "backend.app.auth.refresh_token_logic.refresh_token_service.RefreshTokenService.revoke_all_tokens_for_user",
        new_callable=AsyncMock,
    )

    result = await refresh_token_service.refresh_tokens("garbage-payload-token")

    assert result is None
    revoke_all_mock.assert_not_called()


@pytest.mark.asyncio
async def test_decode_payload_ignores_revocation_status(mocker):
    from backend.app.auth.token_logic.jwt_service import jwt_service

    mocker.patch(
        "backend.app.auth.token_logic.jwt_service.redis_client.hset",
        new_callable=AsyncMock,
    )
    token = await jwt_service.create_refresh_token(email="user@example.com", role="user")

    # decode_payload must return the claims even though revoke status is never
    # consulted — it's used precisely for tokens Redis already marks as revoked
    payload = await jwt_service.decode_payload(token)

    assert payload["email"] == "user@example.com"
    assert payload["type"] == "refresh"


@pytest.mark.asyncio
async def test_decode_payload_returns_none_for_garbage_token():
    from backend.app.auth.token_logic.jwt_service import jwt_service

    assert await jwt_service.decode_payload("not-a-real-jwt") is None
