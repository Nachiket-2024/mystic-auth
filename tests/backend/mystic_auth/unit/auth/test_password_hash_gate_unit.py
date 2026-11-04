"""A burst of password hashes is bounded: a few run, a few wait, the rest are told to retry (503)."""
import asyncio
import threading
import time

import pytest

from backend.mystic_auth.auth.password_logic import password_service as module
from backend.mystic_auth.auth.password_logic.password_service import PasswordService
from backend.mystic_auth.core.errors import AppError
from backend.mystic_auth.core.settings import settings


@pytest.fixture
def tight_gate(monkeypatch):
    monkeypatch.setattr(settings, "PASSWORD_HASH_CONCURRENCY", 1)
    monkeypatch.setattr(settings, "PASSWORD_HASH_MAX_WAITING", 1)
    module._gates.clear()  # the gate reads its size when first created on a loop
    yield
    module._gates.clear()


@pytest.mark.asyncio
async def test_excess_callers_get_503_with_retry_after_and_admitted_ones_finish(tight_gate):
    release = threading.Event()
    started = []

    def slow(tag):
        started.append(tag)
        release.wait(5)
        return tag

    first = asyncio.create_task(module._run_hash(slow, "a"))   # runs
    await asyncio.sleep(0.05)
    second = asyncio.create_task(module._run_hash(slow, "b"))  # waits (1 allowed)
    await asyncio.sleep(0.05)
    with pytest.raises(AppError) as raised:                     # no room left
        await module._run_hash(slow, "c")
    assert raised.value.status_code == 503
    assert raised.value.code == "SERVICE_UNAVAILABLE"
    assert raised.value.headers == {"Retry-After": "5"}

    release.set()
    assert await first == "a"
    assert await second == "b"
    assert started == ["a", "b"]  # only one ran at a time, and the rejected one never started


@pytest.mark.asyncio
async def test_the_waiting_slot_is_given_back_after_the_queue_drains(tight_gate):
    for _ in range(3):  # sequential use never trips the limit
        assert await module._run_hash(lambda: 1) == 1
    assert module._gates[asyncio.get_running_loop()].waiting == 0


@pytest.mark.asyncio
async def test_real_hashing_still_works_through_the_gate():
    hashed = await PasswordService.hash_password("Gate-Check-1!")
    assert await PasswordService.verify_password("Gate-Check-1!", hashed) is True
    assert await PasswordService.verify_password("Gate-Check-2!", hashed) is False


@pytest.mark.asyncio
async def test_a_failed_hash_releases_its_slot(tight_gate):
    def boom():
        raise RuntimeError("hash failed")

    with pytest.raises(RuntimeError):
        await module._run_hash(boom)
    started = time.monotonic()
    assert await module._run_hash(lambda: "ok") == "ok"
    assert time.monotonic() - started < 1
