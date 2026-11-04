"""Failure and not-found paths of the Manage Sessions handlers."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.exc import SQLAlchemyError

from backend.mystic_auth.core.errors import AppError
from backend.mystic_auth.user_session.session_list_handler import (
    session_list_handler,
)
from backend.mystic_auth.user_session.session_revoke_handler import (
    session_revoke_handler,
)

LIST = "backend.mystic_auth.user_session.session_list_handler"
REVOKE = "backend.mystic_auth.user_session.session_revoke_handler"


def _signed_in(mocker, module):
    mocker.patch(
        f"{module}.current_user_handler.get_current_user",
        new_callable=AsyncMock, return_value={"email": "user@example.com"},
    )


@pytest.mark.asyncio
async def test_list_reports_a_database_error_as_500_database_error(mocker):
    _signed_in(mocker, LIST)
    mocker.patch(f"{LIST}.session_service.list_sessions", side_effect=SQLAlchemyError("db down"))
    mocker.patch(f"{LIST}.logger.error")
    with pytest.raises(AppError) as raised:
        await session_list_handler.list_sessions("access", None, db=None)
    assert raised.value.status_code == 500 and raised.value.code == "DATABASE_ERROR"


@pytest.mark.asyncio
async def test_list_reports_any_other_error_as_a_generic_500(mocker):
    _signed_in(mocker, LIST)
    mocker.patch(f"{LIST}.session_service.list_sessions", side_effect=RuntimeError("boom"))
    mocker.patch(f"{LIST}.logger.error")
    with pytest.raises(AppError) as raised:
        await session_list_handler.list_sessions("access", None, db=None)
    assert raised.value.status_code == 500 and raised.value.code == "INTERNAL_SERVER_ERROR"


@pytest.mark.asyncio
async def test_revoke_404s_when_the_user_row_is_gone(mocker):
    _signed_in(mocker, REVOKE)
    mocker.patch(f"{REVOKE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=None)
    with pytest.raises(AppError) as raised:
        await session_revoke_handler.revoke_session("access", None, 5, db=None)
    assert raised.value.status_code == 404 and raised.value.code == "SESSION_NOT_FOUND"


@pytest.mark.asyncio
async def test_revoke_404s_when_the_session_vanished_before_it_could_be_revoked(mocker):
    _signed_in(mocker, REVOKE)
    mocker.patch(f"{REVOKE}.user_crud.get_by_email", new_callable=AsyncMock, return_value=SimpleNamespace(id=1))
    mocker.patch(
        f"{REVOKE}.session_repository.get_by_id",
        new_callable=AsyncMock, return_value=SimpleNamespace(id=5, user_id=1, chain_id="c2"),
    )
    mocker.patch(f"{REVOKE}.session_service.revoke_one_session", new_callable=AsyncMock, return_value=False)
    with pytest.raises(AppError) as raised:
        await session_revoke_handler.revoke_session("access", None, 5, db=None)
    assert raised.value.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "code"),
    [(SQLAlchemyError("db down"), "DATABASE_ERROR"), (RuntimeError("boom"), "INTERNAL_SERVER_ERROR")],
)
async def test_revoke_maps_unexpected_errors_to_500(mocker, error, code):
    _signed_in(mocker, REVOKE)
    mocker.patch(f"{REVOKE}.user_crud.get_by_email", side_effect=error)
    mocker.patch(f"{REVOKE}.logger.error")
    with pytest.raises(AppError) as raised:
        await session_revoke_handler.revoke_session("access", None, 5, db=None)
    assert raised.value.status_code == 500 and raised.value.code == code
