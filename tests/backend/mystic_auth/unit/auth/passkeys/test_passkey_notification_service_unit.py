# Passkey add/remove notices: a passkey outlives a password reset, so the owner
# is emailed on every change. Mail trouble must never fail the passkey change.
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.passkeys import passkey_notification_service as service

TASK = "backend.mystic_auth.auth.passkeys.passkey_notification_service.send_email_task.defer_async"


@pytest.mark.asyncio
async def test_added_notice_is_queued_and_escapes_the_passkey_name(mocker):
    defer = mocker.patch(TASK, new_callable=AsyncMock)

    await service.notify_passkey_added("a@example.com", "<script>alert(1)</script>")

    kwargs = defer.await_args.kwargs
    assert kwargs["to_email"] == "a@example.com"
    assert "<script>alert(1)</script>" not in kwargs["body"]
    assert "&lt;script&gt;" in kwargs["body"]


@pytest.mark.asyncio
@pytest.mark.parametrize("count,phrase", [(1, "1 passkey was removed"), (3, "3 passkeys were removed")])
async def test_removed_notice_pluralizes(mocker, count, phrase):
    defer = mocker.patch(TASK, new_callable=AsyncMock)

    await service.notify_passkeys_removed("a@example.com", count)

    assert phrase in defer.await_args.kwargs["body"]


@pytest.mark.asyncio
async def test_queue_failure_is_swallowed(mocker):
    mocker.patch(TASK, new_callable=AsyncMock, side_effect=RuntimeError("queue down"))

    await service.notify_passkey_added("a@example.com", "Laptop")


@pytest.mark.asyncio
async def test_operator_removal_notice_names_the_count_without_naming_the_operator(mocker):
    defer = mocker.patch(TASK, new_callable=AsyncMock)

    await service.notify_passkeys_removed_by_operator("a@example.com", 2)

    body = defer.await_args.kwargs["body"]
    assert "2 passkeys were removed" in body
    assert "admin" not in body.lower()
