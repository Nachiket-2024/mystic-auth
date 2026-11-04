from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.audit_log import audit_log_service as svc

MODULE = "backend.mystic_auth.audit_log.audit_log_service"


@pytest.fixture
def sinks(mocker):
    alert = mocker.patch("backend.mystic_auth.error_monitoring.sentry_service.capture_security_alert", new_callable=AsyncMock)
    valkey = mocker.patch("backend.mystic_auth.valkey.client.valkey_client.set", new_callable=AsyncMock)
    mocker.patch.object(svc.audit_log_repository, "create_entry", new_callable=AsyncMock)
    return alert, valkey


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "event,meta",
    [(svc.USER_ROLE_CHANGED, {"changed_by": "a@x.io"}), (svc.POLICY_ASSIGNED, {"assigned_by": "a@x.io"})],
)
async def test_privilege_changes_raise_a_real_time_alert(sinks, event, meta):
    alert, valkey = sinks
    valkey.return_value = True

    await svc.log_security_event(event, AsyncMock(), user_email="t@x.io", metadata=meta)

    alert.assert_awaited_once()
    assert alert.await_args.kwargs["metadata"] == {"actor": "a@x.io", "target": "t@x.io"}


@pytest.mark.asyncio
async def test_a_second_change_by_the_same_actor_within_a_minute_is_not_alerted_again(sinks):
    alert, valkey = sinks
    valkey.return_value = None  # SET NX lost: an alert for this actor was already sent

    await svc.log_security_event(svc.POLICY_ASSIGNED, AsyncMock(), user_email="t@x.io", metadata={"assigned_by": "a@x.io"})

    alert.assert_not_awaited()


@pytest.mark.asyncio
async def test_ordinary_events_and_failed_attempts_do_not_alert(sinks):
    alert, valkey = sinks
    valkey.return_value = True

    await svc.log_security_event("login", AsyncMock(), user_email="t@x.io")
    await svc.log_security_event(svc.USER_ROLE_CHANGED, AsyncMock(), user_email="t@x.io", success=False)

    alert.assert_not_awaited()
