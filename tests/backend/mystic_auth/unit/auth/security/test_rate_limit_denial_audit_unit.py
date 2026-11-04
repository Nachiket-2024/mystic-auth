from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.mystic_auth.auth.security.rate_limiting.rate_limiter_service import (
    RateLimiterService,
)

MODULE = "backend.mystic_auth.auth.security.rate_limiting.rate_limiter_service"


@pytest.mark.asyncio
async def test_only_the_first_denial_per_key_and_window_is_audited(mocker):
    set_mock = mocker.patch(f"{MODULE}.valkey_client.set", new_callable=AsyncMock, side_effect=[True, None])
    log = mocker.patch("backend.mystic_auth.audit_log.audit_log_service.log_security_event", new_callable=AsyncMock)
    session_cm = MagicMock()
    session_cm.__aenter__ = AsyncMock(return_value=object())
    session_cm.__aexit__ = AsyncMock(return_value=False)
    mocker.patch("backend.mystic_auth.database.connection.database.async_session", return_value=session_cm)

    await RateLimiterService._audit_denial(None, "login", "ip", "login:ip:1.2.3.4", 60)
    await RateLimiterService._audit_denial(None, "login", "ip", "login:ip:1.2.3.4", 60)

    assert set_mock.await_count == 2
    log.assert_awaited_once()
    assert log.await_args.kwargs["metadata"] == {"endpoint": "login", "scope": "ip"}


@pytest.mark.asyncio
async def test_a_failure_while_auditing_never_breaks_the_429(mocker):
    mocker.patch(f"{MODULE}.valkey_client.set", new_callable=AsyncMock, side_effect=RuntimeError("valkey down"))

    await RateLimiterService._audit_denial(None, "login", "ip", "login:ip:1.2.3.4", 60)  # must not raise
