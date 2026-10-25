from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.procrastinate_tasks import procrastinate_app as module


@pytest.fixture(autouse=True)
def clear_extension_registries():
    listeners = module._task_lifecycle_listeners[:]
    module._task_lifecycle_listeners.clear()
    yield
    module._task_lifecycle_listeners[:] = listeners


@pytest.mark.asyncio
async def test_lifecycle_listener_receives_safe_success_metadata():
    listener = AsyncMock()
    module.register_task_lifecycle_listener(listener)
    context = SimpleNamespace(
        job=SimpleNamespace(id=17, task_name="app.tasks.reconcile", queue="default", attempts=1)
    )

    result = await module._task_lifecycle_middleware(lambda: _success(), context, None)

    assert result == "ok"
    event = listener.await_args.args[0]
    assert event.job_id == 17
    assert event.task_name == "app.tasks.reconcile"
    assert event.outcome == "succeeded"
    assert event.error_type is None
    assert event.duration_seconds >= 0


@pytest.mark.asyncio
async def test_lifecycle_listener_sees_failure_without_changing_task_error():
    listener = AsyncMock()
    module.register_task_lifecycle_listener(listener)
    context = SimpleNamespace(
        job=SimpleNamespace(id=18, task_name="app.tasks.reconcile", queue="default", attempts=2)
    )

    with pytest.raises(RuntimeError, match="boom"):
        await module._task_lifecycle_middleware(lambda: _failure(), context, None)

    event = listener.await_args.args[0]
    assert event.outcome == "failed"
    assert event.error_type == "RuntimeError"
    assert event.attempts == 2


@pytest.mark.asyncio
async def test_listener_failure_does_not_fail_the_task():
    listener = AsyncMock(side_effect=RuntimeError("observer unavailable"))
    module.register_task_lifecycle_listener(listener)
    context = SimpleNamespace(
        job=SimpleNamespace(id=19, task_name="app.tasks.reconcile", queue="default", attempts=1)
    )

    assert await module._task_lifecycle_middleware(lambda: _success(), context, None) == "ok"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "task_name",
    [
        "mystic_auth.procrastinate_tasks.email_tasks.send_email_task",
        "mystic_auth.procrastinate_tasks.account_lifecycle_tasks.deliver_account_lifecycle_event",
    ],
)
async def test_successful_sensitive_job_payload_is_redacted_but_metadata_is_kept(mocker, task_name):
    execute_mock = mocker.patch.object(module.app.connector, "execute_query_async", new_callable=AsyncMock)
    context = SimpleNamespace(
        job=SimpleNamespace(
            id=20,
            task_name=task_name,
            queue="default",
            attempts=1,
        )
    )

    result = await module._task_lifecycle_middleware(lambda: _success(), context, None)

    assert result == "ok"
    execute_mock.assert_awaited_once()
    assert "SET args = '{}'::jsonb" in execute_mock.call_args.kwargs["query"]
    assert execute_mock.call_args.kwargs["job_id"] == 20


@pytest.mark.asyncio
async def test_middleware_raises_when_job_context_has_no_job_id():
    context = SimpleNamespace(
        job=SimpleNamespace(id=None, task_name="app.tasks.reconcile", queue="default", attempts=1)
    )

    with pytest.raises(RuntimeError, match="no job ID"):
        await module._task_lifecycle_middleware(lambda: _success(), context, None)


@pytest.mark.asyncio
async def test_failed_redact_query_is_logged_but_does_not_fail_the_task(mocker):
    mocker.patch.object(
        module.app.connector, "execute_query_async", new_callable=AsyncMock, side_effect=RuntimeError("db down")
    )
    context = SimpleNamespace(
        job=SimpleNamespace(
            id=21,
            task_name="mystic_auth.procrastinate_tasks.account_lifecycle_tasks.deliver_account_lifecycle_event",
            queue="default",
            attempts=1,
        )
    )

    assert await module._task_lifecycle_middleware(lambda: _success(), context, None) == "ok"


def test_load_dotted_callable_accepts_colon_separator():
    loaded = module._load_dotted_callable("backend.mystic_auth.procrastinate_tasks.procrastinate_app:app")
    assert loaded is module.app


def test_load_dotted_callable_accepts_dotted_separator():
    loaded = module._load_dotted_callable("backend.mystic_auth.procrastinate_tasks.procrastinate_app.app")
    assert loaded is module.app


def test_load_dotted_callable_rejects_a_bare_path():
    with pytest.raises(ValueError, match="Expected dotted callable path"):
        module._load_dotted_callable("no_separator_here")


def test_qualified_import_path_leaves_unrecognized_prefixes_untouched():
    assert module._qualified_import_path("some.other.module.path") == "some.other.module.path"


async def _success():
    return "ok"


async def _failure():
    raise RuntimeError("boom")
