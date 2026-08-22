# tests/backend/mystic_auth/unit/user_session/test_session_service_unit.py
#
# Redis fail-open regression coverage for revoke_session_on_logout (plain
# Logout) and revoke_one_session (Manage Sessions "End session"): a chain-
# version bump that can't be confirmed (Redis unreachable) must never look
# identical to a real revoke. See docs/mystic_auth/concerns/README.md's
# now-resolved "Redis outage failure modes are inconsistent" entry.
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.token_logic.token_version_store import TokenVersionUnavailableError
from backend.mystic_auth.user_session.session_service import SessionService

MODULE = "backend.mystic_auth.user_session.session_service"


def _fake_session(chain_id="chain-1", revoked_at=None, user_id=1):
    return SimpleNamespace(id=1, chain_id=chain_id, revoked_at=revoked_at, user_id=user_id)


@pytest.mark.asyncio
async def test_revoke_session_on_logout_returns_true_on_a_confirmed_bump(mocker):
    mocker.patch(
        f"{MODULE}.session_repository.get_by_jti", new_callable=AsyncMock, return_value=_fake_session()
    )
    mocker.patch(f"{MODULE}.jwt_service.bump_chain_version", new_callable=AsyncMock, return_value=True)
    mocker.patch(f"{MODULE}.session_repository.revoke_by_jti", new_callable=AsyncMock)
    mocker.patch(f"{MODULE}.publish_session_revoked", new_callable=AsyncMock)

    result = await SessionService.revoke_session_on_logout(db=object(), jti="jti-1", email="user@example.com")

    assert result is True


@pytest.mark.asyncio
async def test_revoke_session_on_logout_returns_false_when_bump_is_unconfirmed(mocker):
    mocker.patch(
        f"{MODULE}.session_repository.get_by_jti", new_callable=AsyncMock, return_value=_fake_session()
    )
    mocker.patch(f"{MODULE}.jwt_service.bump_chain_version", new_callable=AsyncMock, return_value=False)
    revoke_by_jti_mock = mocker.patch(f"{MODULE}.session_repository.revoke_by_jti", new_callable=AsyncMock)

    result = await SessionService.revoke_session_on_logout(db=object(), jti="jti-1", email="user@example.com")

    assert result is False
    # The Postgres row must be left untouched: marking it revoked while the
    # real Redis-backed version stayed unbumped would make the row lie
    # about the token actually being dead.
    revoke_by_jti_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_revoke_session_on_logout_returns_true_when_nothing_to_revoke(mocker):
    mocker.patch(f"{MODULE}.session_repository.get_by_jti", new_callable=AsyncMock, return_value=None)

    result = await SessionService.revoke_session_on_logout(db=object(), jti="jti-1", email="user@example.com")

    assert result is True


@pytest.mark.asyncio
async def test_revoke_one_session_raises_when_chain_bump_is_unconfirmed(mocker):
    mocker.patch(
        f"{MODULE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=SimpleNamespace(id=1)
    )
    mocker.patch(
        f"{MODULE}.session_repository.get_by_id", new_callable=AsyncMock, return_value=_fake_session(user_id=1)
    )
    mocker.patch(f"{MODULE}.jwt_service.bump_chain_version", new_callable=AsyncMock, return_value=False)
    revoke_by_id_mock = mocker.patch(f"{MODULE}.session_repository.revoke_by_id", new_callable=AsyncMock)

    with pytest.raises(TokenVersionUnavailableError):
        await SessionService.revoke_one_session(db=object(), email="user@example.com", session_id=1)

    # The Postgres row must be left untouched on an unconfirmed bump - see
    # session_revoke_handler.py, which turns this into a 503 rather than a
    # false "Session revoked".
    revoke_by_id_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_revoke_one_session_succeeds_on_a_confirmed_bump(mocker):
    mocker.patch(
        f"{MODULE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=SimpleNamespace(id=1)
    )
    session = _fake_session(user_id=1)
    mocker.patch(f"{MODULE}.session_repository.get_by_id", new_callable=AsyncMock, return_value=session)
    mocker.patch(f"{MODULE}.jwt_service.bump_chain_version", new_callable=AsyncMock, return_value=True)
    mocker.patch(f"{MODULE}.session_repository.revoke_by_id", new_callable=AsyncMock, return_value=session)
    mocker.patch(f"{MODULE}.publish_session_revoked", new_callable=AsyncMock)

    result = await SessionService.revoke_one_session(db=object(), email="user@example.com", session_id=1)

    assert result is session
