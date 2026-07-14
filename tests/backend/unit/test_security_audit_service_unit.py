# tests/backend/unit/test_security_audit_service_unit.py
#
# Unit coverage for audit.services.security_audit_service.log_security_event
# — the single choke point every auth handler calls to persist a security
# audit row. Mirrors AuthorizationService._log_decision's own contract: a
# logging failure must never raise, since the real action it describes has
# already happened (or failed) regardless of whether the audit write
# succeeds.
import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.app.audit_log import audit_log_service
from backend.app.audit_log.audit_log_service import log_security_event, LOGIN_SUCCESS

MODULE = "backend.app.audit_log.audit_log_service"


@pytest.mark.asyncio
async def test_log_security_event_writes_expected_fields(mocker):
    create_entry_mock = mocker.patch(
        f"{MODULE}.audit_log_repository.create_entry", new_callable=AsyncMock
    )

    request = MagicMock()
    request.client.host = "203.0.113.5"
    request.headers.get.return_value = "pytest-agent"
    request.state.request_id = "req-123"

    await log_security_event(
        LOGIN_SUCCESS,
        db="fake-db",
        user_email="user@example.com",
        success=True,
        request=request,
        metadata={"foo": "bar"},
    )

    create_entry_mock.assert_awaited_once_with(
        {
            "user_email": "user@example.com",
            "event_type": LOGIN_SUCCESS,
            "success": True,
            "ip_address": "203.0.113.5",
            "user_agent": "pytest-agent",
            "request_id": "req-123",
            "event_metadata": {"foo": "bar"},
        },
        "fake-db",
    )


@pytest.mark.asyncio
async def test_log_security_event_without_request_omits_request_context(mocker):
    create_entry_mock = mocker.patch(
        f"{MODULE}.audit_log_repository.create_entry", new_callable=AsyncMock
    )

    await log_security_event(LOGIN_SUCCESS, db="fake-db", user_email="user@example.com", success=True)

    written = create_entry_mock.await_args.args[0]
    assert written["ip_address"] is None
    assert written["user_agent"] is None
    assert written["request_id"] is None


@pytest.mark.asyncio
async def test_log_security_event_never_raises_when_repository_fails(mocker):
    mocker.patch(
        f"{MODULE}.audit_log_repository.create_entry",
        new_callable=AsyncMock,
        side_effect=RuntimeError("db is down"),
    )
    warning_mock = mocker.patch.object(audit_log_service.logger, "warning")

    # Must not raise despite the repository failure
    await log_security_event(LOGIN_SUCCESS, db="fake-db", user_email="user@example.com", success=True)

    warning_mock.assert_called_once()
