import asyncio
import uuid

import pytest

from backend.mystic_auth.auth.login.login_handler import login_handler
from backend.mystic_auth.auth.security import account_cooldown_service as cooldown
from backend.mystic_auth.auth.security.client_ip import ip_bucket
from backend.mystic_auth.core.errors import AppError
from backend.mystic_auth.core.settings import settings

HANDLER = "backend.mystic_auth.auth.login.login_handler"


@pytest.fixture
def email():
    return f"cooldown-{uuid.uuid4().hex[:10]}@example.com"


@pytest.mark.asyncio
async def test_no_cooldown_until_the_threshold_then_one_attempt_per_window(email):
    for _ in range(settings.LOGIN_ACCOUNT_FAILURE_THRESHOLD - 1):
        assert await cooldown.record_failure(email) is False
        assert await cooldown.cooldown_remaining_seconds(email) == 0

    # the failure that reaches the threshold reports it exactly once
    assert await cooldown.record_failure(email) is True
    assert await cooldown.record_failure(email) is False

    # first attempt after the threshold takes the slot, the next is told to wait
    assert await cooldown.cooldown_remaining_seconds(email) == 0
    wait = await cooldown.cooldown_remaining_seconds(email)
    assert 1 <= wait <= settings.LOGIN_ACCOUNT_COOLDOWN_SECONDS

    await cooldown.reset(email)


@pytest.mark.asyncio
async def test_a_successful_login_clears_the_count_and_the_cooldown(email):
    for _ in range(settings.LOGIN_ACCOUNT_FAILURE_THRESHOLD):
        await cooldown.record_failure(email)
    assert await cooldown.cooldown_remaining_seconds(email) == 0
    assert await cooldown.cooldown_remaining_seconds(email) > 0

    await cooldown.reset(email)

    assert await cooldown.cooldown_remaining_seconds(email) == 0
    assert await cooldown.cooldown_remaining_seconds(email) == 0


@pytest.mark.asyncio
async def test_concurrent_attempts_cannot_both_take_the_single_slot(email):
    for _ in range(settings.LOGIN_ACCOUNT_FAILURE_THRESHOLD):
        await cooldown.record_failure(email)

    results = await asyncio.gather(*(cooldown.cooldown_remaining_seconds(email) for _ in range(10)))

    assert results.count(0) == 1
    await cooldown.reset(email)


@pytest.mark.asyncio
async def test_counts_are_per_account_not_shared(email):
    other = f"other-{uuid.uuid4().hex[:10]}@example.com"
    for _ in range(settings.LOGIN_ACCOUNT_FAILURE_THRESHOLD):
        await cooldown.record_failure(email)
    assert await cooldown.cooldown_remaining_seconds(other) == 0
    await cooldown.reset(email)


@pytest.mark.asyncio
async def test_valkey_failure_while_checking_is_reported_as_503(mocker, email):
    mocker.patch("backend.mystic_auth.auth.security.account_cooldown_service.valkey_client.get", side_effect=OSError)
    with pytest.raises(AppError) as raised:
        await cooldown.cooldown_remaining_seconds(email)
    assert raised.value.status_code == 503


@pytest.mark.asyncio
async def test_login_during_cooldown_is_429_with_retry_after_and_skips_the_password_check(mocker):
    mocker.patch(f"{HANDLER}.login_protection_service.is_locked", return_value=False)
    mocker.patch(f"{HANDLER}.account_cooldown_service.cooldown_remaining_seconds", return_value=17)
    login = mocker.patch(f"{HANDLER}.login_service.login")

    response = await login_handler.handle_login(email="a@example.com", password="x")

    assert response.status_code == 429
    assert response.headers["retry-after"] == "17"
    login.assert_not_called()


@pytest.mark.asyncio
async def test_crossing_the_threshold_writes_an_audit_event_and_alert(mocker):
    mocker.patch(f"{HANDLER}.login_protection_service.is_locked", return_value=False)
    mocker.patch(f"{HANDLER}.account_cooldown_service.cooldown_remaining_seconds", return_value=0)
    mocker.patch(f"{HANDLER}.login_service.login", return_value=None)
    mocker.patch(f"{HANDLER}.account_cooldown_service.record_failure", return_value=True)
    mocker.patch(f"{HANDLER}.login_protection_service.check_and_record_action", return_value=True)
    audit = mocker.patch(f"{HANDLER}.log_security_event")
    alert = mocker.patch(f"{HANDLER}.capture_security_alert")

    response = await login_handler.handle_login(email="a@example.com", password="x")

    assert response.status_code == 401
    assert any(call.args[0] == "login_account_cooldown" for call in audit.await_args_list)
    assert alert.await_args.args[0] == "login_account_cooldown"
    assert "password" not in str(alert.await_args)


@pytest.mark.asyncio
async def test_store_outage_in_the_cooldown_check_surfaces_as_503_not_500(mocker):
    mocker.patch(f"{HANDLER}.login_protection_service.is_locked", return_value=False)
    mocker.patch(
        f"{HANDLER}.account_cooldown_service.cooldown_remaining_seconds",
        side_effect=AppError(503, "SERVICE_UNAVAILABLE", "down"),
    )
    with pytest.raises(AppError) as raised:
        await login_handler.handle_login(email="a@example.com", password="x")
    assert raised.value.status_code == 503


@pytest.mark.parametrize(
    ("ip", "bucket"),
    [
        ("203.0.113.7", "203.0.113.7"),
        ("2001:db8:aaaa:bbbb:1111:2222:3333:4444", "v6-2001-0db8-aaaa-bbbb"),
        ("2001:db8:aaaa:bbbb::1", "v6-2001-0db8-aaaa-bbbb"),
        ("::ffff:198.51.100.9", "198.51.100.9"),
        (None, "unknown"),
        ("not-an-ip", "not-an-ip"),
    ],
)
def test_ip_bucket_groups_an_ipv6_slash_64_and_never_contains_a_colon_for_ipv6(ip, bucket):
    assert ip_bucket(ip) == bucket
    if bucket.startswith("v6-"):
        assert ":" not in bucket


def test_two_addresses_in_one_slash_64_share_a_bucket_but_other_prefixes_do_not():
    assert ip_bucket("2001:db8:1:2:aaaa::1") == ip_bucket("2001:db8:1:2:bbbb::9")
    assert ip_bucket("2001:db8:1:2::1") != ip_bucket("2001:db8:1:3::1")


@pytest.mark.asyncio
async def test_record_failure_swallows_a_cache_outage_and_reports_no_alert(mocker):
    mocker.patch("backend.mystic_auth.auth.security.account_cooldown_service.valkey_client.incr", side_effect=ConnectionError("valkey down"))
    log = mocker.patch("backend.mystic_auth.auth.security.account_cooldown_service.logger.error")
    assert await cooldown.record_failure("a@example.com") is False
    log.assert_called_once()


@pytest.mark.asyncio
async def test_reset_swallows_a_cache_outage(mocker):
    mocker.patch("backend.mystic_auth.auth.security.account_cooldown_service.valkey_client.delete", side_effect=ConnectionError("valkey down"))
    log = mocker.patch("backend.mystic_auth.auth.security.account_cooldown_service.logger.error")
    await cooldown.reset("a@example.com")
    log.assert_called_once()


@pytest.mark.asyncio
async def test_failure_window_expiry_is_set_on_the_first_failure_only(mocker):
    from unittest.mock import AsyncMock

    mod = "backend.mystic_auth.auth.security.account_cooldown_service"
    expire = mocker.patch(f"{mod}.valkey_client.expire", new_callable=AsyncMock)
    mocker.patch(f"{mod}.valkey_client.incr", new_callable=AsyncMock, return_value=1)
    await cooldown.record_failure("a@example.com")
    assert expire.await_count == 1
    mocker.patch(f"{mod}.valkey_client.incr", new_callable=AsyncMock, return_value=2)
    await cooldown.record_failure("a@example.com")
    assert expire.await_count == 1
