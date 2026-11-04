# tests/backend/app/test_main_global_exception_handler_unit.py
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.exceptions import RequestValidationError

from backend.app.main import global_exception_handler, request_validation_error_handler

MODULE = "backend.app.main"


@pytest.mark.asyncio
async def test_global_exception_handler_reports_to_error_monitoring_and_returns_generic_500(mocker):
    # This handler runs before Starlette marks the exception "unhandled", so
    # sentry-sdk's auto-instrumentation never fires; capture_exception must be
    # called explicitly or nothing gets reported.
    capture_mock = mocker.patch(f"{MODULE}.capture_exception", new_callable=AsyncMock)
    request = MagicMock()
    request.url.path = "/users/me"
    exc = RuntimeError("something broke")

    response = await global_exception_handler(request, exc)

    capture_mock.assert_awaited_once_with(exc, request=request)
    assert response.status_code == 500
    # Clients never see exception internals: docs/mystic_auth/security/hardening-http.md#error-handling
    assert b"something broke" not in response.body


@pytest.mark.asyncio
async def test_extra_forbidden_validation_is_logged_without_echoing_input(caplog):
    request = MagicMock()
    request.url.path = "/users/me"
    request.state.request_id = "request-123"
    exc = RequestValidationError([
        {
            "type": "extra_forbidden",
            "loc": ("body", "role"),
            "msg": "Extra inputs are not permitted",
            "input": "system_superuser",
        }
    ])

    response = await request_validation_error_handler(request, exc)

    assert response.status_code == 422
    assert b"system_superuser" not in response.body
    assert "Rejected mass-assignment input" in caplog.text
    assert "role" in caplog.text
    assert "request-123" in caplog.text
    assert "system_superuser" not in caplog.text


@pytest.mark.asyncio
async def test_nul_byte_database_error_is_a_400_not_a_500(mocker):
    from sqlalchemy.exc import DBAPIError

    from backend.app.main import database_error_handler

    capture_mock = mocker.patch(f"{MODULE}.capture_exception", new_callable=AsyncMock)
    exc = DBAPIError("SELECT 1", {}, Exception('invalid byte sequence for encoding "UTF8": 0x00'))

    response = await database_error_handler(MagicMock(), exc)

    assert response.status_code == 400
    assert b"INVALID_CHARACTER" in response.body
    capture_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_other_database_errors_still_return_the_generic_500(mocker):
    from sqlalchemy.exc import DBAPIError

    from backend.app.main import database_error_handler

    mocker.patch(f"{MODULE}.capture_exception", new_callable=AsyncMock)
    request = MagicMock()
    request.url.path = "/users/"
    response = await database_error_handler(request, DBAPIError("SELECT 1", {}, Exception("deadlock detected")))

    assert response.status_code == 500
