from datetime import UTC, datetime, timedelta

import pytest

from backend.mystic_auth.auth.security.rate_limiting.rate_limiter_service import (
    rate_limiter_service,
)
from backend.mystic_auth.authorization.policies.default_policies import (
    SELF_SERVICE_POLICY_NAME,
)

from .audit_log_query_test_support import (
    PASSWORD,
    _cleanup_security_audit_log,  # noqa: F401 - pytest discovers imported fixtures in this module.
    _create_system_user,
    _create_verified_user,
    _unique_email,
)


@pytest.mark.asyncio
async def test_unauthenticated_request_is_rejected(client):
    resp = await client.get("/audit/security-log")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_regular_user_cannot_query_the_global_security_audit_log(
    client, created_emails
):
    email = _unique_email()
    await _create_verified_user(
        client, created_emails, email, [SELF_SERVICE_POLICY_NAME]
    )

    resp = await client.get("/audit/security-log")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_system_user_can_list_the_global_security_audit_log(
    client, created_emails
):
    system_email = _unique_email("system")
    await _create_system_user(client, created_emails, system_email)

    resp = await client.get("/audit/security-log", params={"limit": 5})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) <= 5


@pytest.mark.asyncio
async def test_regular_user_can_read_their_own_security_log(client, created_emails):
    email = _unique_email()
    await _create_verified_user(
        client, created_emails, email, [SELF_SERVICE_POLICY_NAME]
    )

    resp = await client.get("/audit/security-log/me")
    assert resp.status_code == 200
    entries = resp.json()
    assert all(e["user_email"] == email for e in entries if e["user_email"] is not None)


@pytest.mark.asyncio
async def test_global_security_log_search_filters_by_user_email(client, created_emails):
    system_email = _unique_email("system")
    await _create_system_user(client, created_emails, system_email)
    target_email = _unique_email("searchtarget")
    # Signup alone (see test_signup_writes_a_signup_audit_entry) already
    # writes a SIGNUP security-log entry for target_email. Ends logged in
    # as target_email, so switch back to the system user afterwards.
    await _create_verified_user(
        client, created_emails, target_email, [SELF_SERVICE_POLICY_NAME]
    )
    login_resp = await client.post(
        "/auth/login", json={"email": system_email, "password": PASSWORD}
    )
    assert login_resp.status_code == 200

    resp = await client.get(
        "/audit/security-log", params={"search": target_email, "limit": 100}
    )
    assert resp.status_code == 200
    entries = resp.json()
    assert entries
    assert all(e["user_email"] == target_email for e in entries)


@pytest.mark.asyncio
async def test_global_security_log_sort_by_user_email(client, created_emails):
    system_email = _unique_email("system")
    await _create_system_user(client, created_emails, system_email)

    # Two distinct, known-orderable emails sharing a common search prefix so
    # this test's own rows are isolated from other entries in the table.
    prefix = _unique_email("sorttest").split("@")[0]
    email_a = f"{prefix}-aaa@example.com"
    email_b = f"{prefix}-bbb@example.com"
    # Each signup alone writes a SIGNUP security-log entry.
    await _create_verified_user(
        client, created_emails, email_b, [SELF_SERVICE_POLICY_NAME]
    )
    await _create_verified_user(
        client, created_emails, email_a, [SELF_SERVICE_POLICY_NAME]
    )

    login_resp = await client.post(
        "/auth/login", json={"email": system_email, "password": PASSWORD}
    )
    assert login_resp.status_code == 200

    resp = await client.get(
        "/audit/security-log",
        params={
            "search": prefix,
            "sort_by": "user_email",
            "sort_dir": "asc",
            "limit": 100,
        },
    )
    assert resp.status_code == 200
    emails = [e["user_email"] for e in resp.json()]
    assert emails == sorted(emails)
    assert email_a in emails
    assert email_b in emails
    assert emails.index(email_a) < emails.index(email_b)


@pytest.mark.asyncio
async def test_global_security_log_filters_by_event_type_and_success(
    client, created_emails
):
    system_email = _unique_email("system")
    await _create_system_user(client, created_emails, system_email)
    target_email = _unique_email("filtertarget")
    # Ends logged in as target_email.
    await _create_verified_user(
        client, created_emails, target_email, [SELF_SERVICE_POLICY_NAME]
    )

    # A failed login (wrong password) writes a login_failure/success=false
    # row; a successful one writes login_success/success=true.
    failed_resp = await client.post(
        "/auth/login",
        json={"email": target_email, "password": "definitely-wrong-password"},
    )
    assert failed_resp.status_code == 401
    success_resp = await client.post(
        "/auth/login", json={"email": target_email, "password": PASSWORD}
    )
    assert success_resp.status_code == 200

    login_resp = await client.post(
        "/auth/login", json={"email": system_email, "password": PASSWORD}
    )
    assert login_resp.status_code == 200

    failure_only = await client.get(
        "/audit/security-log",
        params={
            "search": target_email,
            "event_type": "login_failure",
            "success": False,
            "limit": 100,
        },
    )
    assert failure_only.status_code == 200
    failure_entries = failure_only.json()
    assert failure_entries
    assert all(
        e["event_type"] == "login_failure" and e["success"] is False
        for e in failure_entries
    )

    success_only = await client.get(
        "/audit/security-log",
        params={
            "search": target_email,
            "event_type": "login_success",
            "success": True,
            "limit": 100,
        },
    )
    assert success_only.status_code == 200
    success_entries = success_only.json()
    assert success_entries
    assert all(
        e["event_type"] == "login_success" and e["success"] is True
        for e in success_entries
    )


@pytest.mark.asyncio
async def test_global_security_log_filters_by_from_and_to(client, created_emails):
    system_email = _unique_email("system")
    await _create_system_user(client, created_emails, system_email)
    target_email = _unique_email("rangetarget")
    # Signup alone writes a SIGNUP row for target_email, timestamped "now".
    await _create_verified_user(
        client, created_emails, target_email, [SELF_SERVICE_POLICY_NAME]
    )

    login_resp = await client.post(
        "/auth/login", json={"email": system_email, "password": PASSWORD}
    )
    assert login_resp.status_code == 200

    now = datetime.now(UTC)

    in_range = await client.get(
        "/audit/security-log",
        params={
            "search": target_email,
            "from": (now - timedelta(minutes=5)).isoformat(),
            "to": (now + timedelta(minutes=5)).isoformat(),
            "limit": 100,
        },
    )
    assert in_range.status_code == 200
    in_range_entries = in_range.json()
    assert in_range_entries
    assert all(e["user_email"] == target_email for e in in_range_entries)

    before_row_existed = await client.get(
        "/audit/security-log",
        params={
            "search": target_email,
            "to": (now - timedelta(minutes=5)).isoformat(),
            "limit": 100,
        },
    )
    assert before_row_existed.status_code == 200
    assert before_row_existed.json() == []

    after_row_existed = await client.get(
        "/audit/security-log",
        params={
            "search": target_email,
            "from": (now + timedelta(minutes=5)).isoformat(),
            "limit": 100,
        },
    )
    assert after_row_existed.status_code == 200
    assert after_row_existed.json() == []


@pytest.mark.asyncio
async def test_security_log_list_is_rate_limited_per_account(client, created_emails):
    """F-006 regression: a table-wide query with no prior throttling beyond
    the security_audit:read permission check - confirmed live in the
    2026-10-14 audit. list_security_audit_log now carries the same
    @rate_limiter_service.rate_limited decorator every other sensitive
    endpoint in this codebase already has."""
    system_email = _unique_email("system")
    await _create_system_user(client, created_emails, system_email)
    await client.post("/auth/login", json={"email": system_email, "password": PASSWORD})

    max_requests, _window_seconds = rate_limiter_service.ENDPOINT_OVERRIDES[
        "security_log_list"
    ]

    statuses = []
    for _ in range(max_requests + 2):
        resp = await client.get("/audit/security-log")
        statuses.append(resp.status_code)

    assert statuses[:max_requests] == [200] * max_requests
    assert 429 in statuses[max_requests:]
