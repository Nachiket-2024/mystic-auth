# tests/backend/unit/test_account_verification_service_unit.py
#
# Regression guards for two Phase 1 auth-audit fixes to verify_token:
#   1. Single-use enforcement previously did a separate GET then DELETE
#      against Redis — a TOCTOU race let two concurrent requests both pass
#      the GET before either ran the DELETE, both treating a single-use
#      token as valid. Fixed by using an atomic GETDEL.
#   2. create_verification_token sets role="verify" on the JWT, claiming
#      "this token is only valid for email confirmation" — but verify_token
#      never actually checked that claim, making it purely decorative.
import pytest
from unittest.mock import AsyncMock

from backend.app.auth.verify_account.account_verification_service import (
    account_verification_service,
)

MODULE = "backend.app.auth.verify_account.account_verification_service"


@pytest.mark.asyncio
async def test_verify_token_uses_atomic_getdel_not_separate_get_and_delete(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "verify"},
    )
    getdel_mock = mocker.patch(f"{MODULE}.redis_client.getdel", new_callable=AsyncMock, return_value="1")
    get_mock = mocker.patch(f"{MODULE}.redis_client.get", new_callable=AsyncMock)
    delete_mock = mocker.patch(f"{MODULE}.redis_client.delete", new_callable=AsyncMock)

    result = await account_verification_service.verify_token("some-token")

    assert result == {"email": "user@example.com", "role": "verify"}
    getdel_mock.assert_awaited_once_with("verify:some-token")
    # No separate GET/DELETE round-trip — the whole point of the fix is that
    # a single atomic operation replaces the racy two-step check.
    get_mock.assert_not_called()
    delete_mock.assert_not_called()


@pytest.mark.asyncio
async def test_verify_token_rejects_already_consumed_single_use_token(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "verify"},
    )
    mocker.patch(f"{MODULE}.redis_client.getdel", new_callable=AsyncMock, return_value=None)

    result = await account_verification_service.verify_token("already-used-token")

    assert result is None


@pytest.mark.asyncio
async def test_verify_token_rejects_token_with_wrong_role_claim(mocker):
    # A validly-signed, unexpired access token minted for some other purpose
    # (role != "verify") must never be accepted here, even if it otherwise
    # decodes fine and has a matching Redis single-use record.
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com", "role": "user"},
    )
    getdel_mock = mocker.patch(f"{MODULE}.redis_client.getdel", new_callable=AsyncMock)

    result = await account_verification_service.verify_token("wrong-role-token")

    assert result is None
    # Must be rejected on the role check before ever touching Redis
    getdel_mock.assert_not_called()


@pytest.mark.asyncio
async def test_verify_token_rejects_missing_role_claim(mocker):
    mocker.patch(
        f"{MODULE}.jwt_service.verify_token",
        new_callable=AsyncMock,
        return_value={"email": "user@example.com"},
    )
    getdel_mock = mocker.patch(f"{MODULE}.redis_client.getdel", new_callable=AsyncMock)

    result = await account_verification_service.verify_token("no-role-token")

    assert result is None
    getdel_mock.assert_not_called()
