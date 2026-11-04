import httpx
import pytest

from backend.mystic_auth.error_monitoring import security_alert_delivery as delivery

MODULE = "backend.mystic_auth.error_monitoring.security_alert_delivery"
PAYLOAD = {
    "event_type": "policy_assigned",
    "environment": "production",
    "occurred_at": "2026-11-04T00:00:00+00:00",
    "metadata": {"actor": "a@example.com", "target": "b@example.com"},
}


def _capture_requests(mocker):
    """Route httpx through a transport that records the request."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200)

    real = httpx.AsyncClient
    mocker.patch(f"{MODULE}.httpx.AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    return seen


@pytest.mark.asyncio
async def test_ntfy_format_sends_readable_text_with_title_priority_and_bearer(mocker):
    mocker.patch(f"{MODULE}.settings.SECURITY_ALERT_WEBHOOK_URL", "https://ntfy.sh/mystic-auth-topic")
    mocker.patch(f"{MODULE}.settings.SECURITY_ALERT_WEBHOOK_FORMAT", "ntfy")
    mocker.patch(f"{MODULE}.settings.SECURITY_ALERT_WEBHOOK_TOKEN", "tk_secret")
    seen = _capture_requests(mocker)

    await delivery.send_alert("policy_assigned", PAYLOAD)

    request = seen[0]
    assert str(request.url) == "https://ntfy.sh/mystic-auth-topic"
    assert request.headers["authorization"] == "Bearer tk_secret"
    assert request.headers["priority"] == "high"
    assert request.headers["title"].endswith(": policy_assigned")
    body = request.content.decode()
    assert "actor: a@example.com" in body and "environment: production" in body
    assert "tk_secret" not in body


@pytest.mark.asyncio
async def test_rate_limit_alerts_use_default_priority(mocker):
    mocker.patch(f"{MODULE}.settings.SECURITY_ALERT_WEBHOOK_URL", "https://ntfy.sh/t")
    mocker.patch(f"{MODULE}.settings.SECURITY_ALERT_WEBHOOK_FORMAT", "ntfy")
    seen = _capture_requests(mocker)
    await delivery.send_alert("rate_limit_exceeded", PAYLOAD)
    assert seen[0].headers["priority"] == "default"


@pytest.mark.asyncio
async def test_json_format_keeps_the_generic_contract(mocker):
    mocker.patch(f"{MODULE}.settings.SECURITY_ALERT_WEBHOOK_URL", "https://alerts.example.test/hook")
    mocker.patch(f"{MODULE}.settings.SECURITY_ALERT_WEBHOOK_FORMAT", "json")
    seen = _capture_requests(mocker)
    await delivery.send_alert("policy_assigned", PAYLOAD)
    assert seen[0].headers["content-type"] == "application/json"
    assert seen[0].read() and b'"event_type"' in seen[0].content


@pytest.mark.asyncio
async def test_non_2xx_response_raises_so_the_job_retries(mocker):
    mocker.patch(f"{MODULE}.settings.SECURITY_ALERT_WEBHOOK_URL", "https://ntfy.sh/t")
    real = httpx.AsyncClient
    mocker.patch(
        f"{MODULE}.httpx.AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(lambda r: httpx.Response(503)), **kw),
    )
    with pytest.raises(httpx.HTTPStatusError):
        await delivery.send_alert("x", PAYLOAD)


@pytest.mark.asyncio
async def test_identical_alert_within_a_minute_is_dropped_and_a_burst_is_capped(mocker):
    store: dict[str, int] = {}

    async def set_nx(key, value, ex=None, nx=False):
        if key in store:
            return None
        store[key] = 1
        return True

    async def incr(key):
        store[key] = store.get(key, 0) + 1
        return store[key]

    mocker.patch(f"{MODULE}.valkey_client.set", side_effect=set_nx)
    mocker.patch(f"{MODULE}.valkey_client.incr", side_effect=incr)
    mocker.patch(f"{MODULE}.valkey_client.expire", mocker.AsyncMock())

    assert await delivery.should_send("e", {"n": 1}) is True
    assert await delivery.should_send("e", {"n": 1}) is False  # identical
    results = [await delivery.should_send("e", {"n": i}) for i in range(2, 30)]
    assert results.count(True) == delivery.ALERT_MAX_PER_MINUTE - 1  # one slot already used


@pytest.mark.asyncio
async def test_throttle_fails_open_when_valkey_is_down(mocker):
    mocker.patch(f"{MODULE}.valkey_client.set", side_effect=ConnectionError("down"))
    assert await delivery.should_send("e", {}) is True


@pytest.mark.parametrize(
    ("url", "placeholder"),
    [
        ("https://example.com/mystic-auth-test-alert-hook", True),
        ("https://alerts.example.test/x", True),
        ("https://hooks.example.org/x", True),
        ("https://ntfy.sh/mystic-auth-abc123", False),
        ("https://alerts.mycompany.io/x", False),
    ],
)
def test_placeholder_detection(url, placeholder):
    assert delivery.webhook_is_placeholder(url) is placeholder


def test_startup_warns_for_unset_and_placeholder_urls_but_not_a_real_one(mocker):
    warn = mocker.patch(f"{MODULE}.startup_logger.warning")
    for url, expected_calls in (("", 1), ("https://example.com/hook", 1), ("https://ntfy.sh/real-topic", 0)):
        warn.reset_mock()
        mocker.patch(f"{MODULE}.settings.SECURITY_ALERT_WEBHOOK_URL", url)
        delivery.warn_if_alert_destination_unusable()
        assert warn.call_count == expected_calls


def test_request_urls_are_not_logged_because_an_ntfy_topic_is_a_secret():
    import logging

    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
