import pytest

from backend.mystic_auth.procrastinate_tasks.procrastinate_app import (
    TaskLifecycleEvent,
    _alert_job_failure,
)


def _event(**overrides):
    base = {
        "job_id": 7,
        "task_name": "mystic_auth.procrastinate_tasks.audit_log_tasks.log_authorization_decision_task",
        "queue": "default", "attempts": 3, "outcome": "failed", "duration_seconds": 0.1,
        "error_type": "OperationalError",
    }
    return TaskLifecycleEvent(**{**base, **overrides})


@pytest.mark.asyncio
async def test_failure_alert_has_metadata_only_no_task_arguments(mocker):
    alert = mocker.patch("backend.mystic_auth.error_monitoring.sentry_service.capture_security_alert")
    await _alert_job_failure(_event())
    event_type, = alert.await_args.args
    assert event_type == "background_job_failed"
    assert alert.await_args.kwargs["metadata"] == {
        "task": "log_authorization_decision_task", "job_id": 7, "attempts": 3, "error_type": "OperationalError",
    }


@pytest.mark.asyncio
async def test_failure_alert_never_raises(mocker):
    mocker.patch("backend.mystic_auth.error_monitoring.sentry_service.capture_security_alert", side_effect=RuntimeError("sink down"))
    await _alert_job_failure(_event())


@pytest.mark.asyncio
async def test_failed_alert_delivery_does_not_raise_another_alert(mocker):
    alert = mocker.patch("backend.mystic_auth.error_monitoring.sentry_service.capture_security_alert")
    await _alert_job_failure(_event(task_name="mystic_auth.procrastinate_tasks.alert_tasks.deliver_security_alert_task"))
    alert.assert_not_called()
