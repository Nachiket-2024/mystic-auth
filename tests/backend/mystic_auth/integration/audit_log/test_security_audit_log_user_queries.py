import pytest

from backend.mystic_auth.authorization.policies.default_policies import (
    SELF_SERVICE_POLICY_NAME,
    USER_MANAGEMENT_POLICY_NAME,
)

from .audit_log_query_test_support import (
    PASSWORD,
    _cleanup_security_audit_log,  # noqa: F401 - pytest discovers imported fixtures in this module.
    _create_system_user,
    _create_verified_user,
    _unique_email,
)


@pytest.mark.asyncio
async def test_user_security_log_requires_security_audit_read(client, created_emails):
    """The admin per-user route (UserAccessDialog's "Recent access changes")
    is gated the same as the global list, not self-scoped like /me - a
    caller without security_audit:read must be refused even when asking
    about their own email through this route."""
    email = _unique_email()
    await _create_verified_user(
        client, created_emails, email, [SELF_SERVICE_POLICY_NAME]
    )

    resp = await client.get(f"/audit/security-log/users/{email}")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_user_security_log_scopes_to_the_path_user_only(client, created_emails):
    system_email = _unique_email("system")
    await _create_system_user(client, created_emails, system_email)
    target_email = _unique_email("usertarget")
    other_email = _unique_email("otheruser")
    # Both signups alone write a SIGNUP row for each email; ends logged in
    # as other_email, so log back in as the system user afterwards.
    await _create_verified_user(
        client, created_emails, target_email, [SELF_SERVICE_POLICY_NAME]
    )
    await _create_verified_user(
        client, created_emails, other_email, [SELF_SERVICE_POLICY_NAME]
    )
    login_resp = await client.post(
        "/auth/login", json={"email": system_email, "password": PASSWORD}
    )
    assert login_resp.status_code == 200

    resp = await client.get(
        f"/audit/security-log/users/{target_email}", params={"limit": 100}
    )
    assert resp.status_code == 200
    entries = resp.json()
    assert entries
    assert all(e["user_email"] == target_email for e in entries)


@pytest.mark.asyncio
async def test_user_security_log_access_change_alias_filters_to_admin_actions_only(
    client, created_emails
):
    """event_type=access_change (UserAccessDialog's "Recent access changes")
    must return only the events that represent an admin changing this
    user's access (policy assign/revoke here), never the account's own
    unrelated auth activity (its own signup row) even though both are on
    the same user_email."""
    system_email = _unique_email("system")
    await _create_system_user(client, created_emails, system_email)
    target_email = _unique_email("changetarget")
    # Signup alone writes a non-access-change SIGNUP row for target_email.
    await _create_verified_user(
        client, created_emails, target_email, [SELF_SERVICE_POLICY_NAME]
    )
    login_resp = await client.post(
        "/auth/login", json={"email": system_email, "password": PASSWORD}
    )
    assert login_resp.status_code == 200

    assign_resp = await client.post(
        f"/authorization/users/{target_email}/policies",
        json={"policy_name": USER_MANAGEMENT_POLICY_NAME},
    )
    assert assign_resp.status_code == 200

    resp = await client.get(
        f"/audit/security-log/users/{target_email}",
        params={"event_type": "access_change", "limit": 100},
    )
    assert resp.status_code == 200
    entries = resp.json()
    assert entries
    event_types = {e["event_type"] for e in entries}
    assert event_types == {"policy_assigned"}
    assert "signup" not in event_types


@pytest.mark.asyncio
async def test_login_trend_search_filters_by_user_email(client, created_emails):
    system_email = _unique_email("system")
    await _create_system_user(client, created_emails, system_email)
    target_email = _unique_email("trendtarget")
    # Ends logged in as target_email; the signup+verify flow doesn't itself
    # write a login-shaped event, so log in once to get one success row.
    await _create_verified_user(
        client, created_emails, target_email, [SELF_SERVICE_POLICY_NAME]
    )
    own_login_resp = await client.post(
        "/auth/login", json={"email": target_email, "password": PASSWORD}
    )
    assert own_login_resp.status_code == 200

    login_resp = await client.post(
        "/auth/login", json={"email": system_email, "password": PASSWORD}
    )
    assert login_resp.status_code == 200

    matching = await client.get(
        "/audit/security-log/login-trend", params={"days": 1, "search": target_email}
    )
    assert matching.status_code == 200
    matching_points = matching.json()
    assert matching_points
    assert sum(p["success"] + p["failure"] for p in matching_points) >= 1

    no_match_email = _unique_email("nomatch")
    non_matching = await client.get(
        "/audit/security-log/login-trend", params={"days": 1, "search": no_match_email}
    )
    assert non_matching.status_code == 200
    non_matching_points = non_matching.json()
    assert non_matching_points
    assert sum(p["success"] + p["failure"] for p in non_matching_points) == 0
