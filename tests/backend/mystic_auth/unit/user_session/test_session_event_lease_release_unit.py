import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

import backend.mystic_auth.user_session.session_events as module
from backend.mystic_auth.user_session.session_events import (
    acquire_session_event_lease,
    refresh_session_event_lease,
    session_event_stream,
)

MODULE = "backend.mystic_auth.user_session.session_events"


@pytest.fixture(autouse=True)
def _reset_shutdown_event():
    module._shutdown_event = asyncio.Event()
    yield
    module._shutdown_event = asyncio.Event()


async def _wait_forever(*_args, **_kwargs):
    await asyncio.sleep(30)


def _fake_pubsub(blocking=False):
    pubsub = MagicMock()
    pubsub.subscribe = AsyncMock()
    pubsub.unsubscribe = AsyncMock()
    pubsub.aclose = AsyncMock()
    pubsub.get_message = _wait_forever if blocking else AsyncMock(return_value=None)
    return pubsub


@pytest.mark.asyncio
async def test_a_lease_handed_in_by_the_route_is_released_when_the_stream_ends(mocker):
    # Regression for F-007: the route reserves the slot and passes the token in,
    # and nothing released it when the client went away.
    mocker.patch(f"{MODULE}.valkey_client.pubsub", return_value=_fake_pubsub())
    release = mocker.patch(f"{MODULE}.release_session_event_lease", new_callable=AsyncMock)
    module._shutdown_event.set()

    chunks = [c async for c in session_event_stream("u@example.com", "1.2.3.4", lease_token="tok")]

    assert chunks == []
    release.assert_awaited_once_with("u@example.com", "1.2.3.4", "tok")


@pytest.mark.asyncio
async def test_the_lease_is_released_when_the_client_disconnects_mid_stream(mocker):
    mocker.patch(f"{MODULE}.valkey_client.pubsub", return_value=_fake_pubsub(blocking=True))
    release = mocker.patch(f"{MODULE}.release_session_event_lease", new_callable=AsyncMock)

    stream = session_event_stream("u@example.com", "1.2.3.4", lease_token="tok")
    task = asyncio.ensure_future(stream.__anext__())
    await asyncio.sleep(0.05)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await stream.aclose()

    release.assert_awaited_once_with("u@example.com", "1.2.3.4", "tok")


@pytest.mark.asyncio
async def test_a_new_lease_is_short_lived_so_a_crash_frees_the_slot_quickly(mocker):
    eval_mock = mocker.patch(f"{MODULE}.valkey_client.eval", new_callable=AsyncMock, return_value=1)
    mocker.patch("backend.mystic_auth.user_session.session_event_leases.time", MagicMock(time=lambda: 1000))

    assert await acquire_session_event_lease("u@example.com", "1.2.3.4") is not None

    args = eval_mock.await_args.args
    expires = args[5]
    assert expires - 1000 <= 60, "lease must not outlive a few heartbeats"


@pytest.mark.asyncio
async def test_renewing_a_lease_never_raises(mocker):
    mocker.patch(f"{MODULE}.valkey_client.eval", new_callable=AsyncMock, side_effect=RuntimeError("down"))

    await refresh_session_event_lease("u@example.com", "1.2.3.4", "tok")
