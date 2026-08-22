# tests/backend/mystic_auth/integration/audit_log/test_audit_log_query_api_integration.py
#
# End-to-end coverage for the /authorization/audit-log query routes'
# own PBAC gating and search/sort/filter behavior, against the real ASGI
# app, real PostgreSQL, and real Redis.
#
# Split out of test_audit_log_integration.py once that file passed the
# repo's own file-length guideline; this half covers only the query API.
# See test_audit_log_automatic_logging_integration.py for coverage of
# automatic logging on real protected routes.
import pytest

from backend.mystic_auth.authorization.policies.default_policies import (
    SELF_SERVICE_POLICY_NAME,
)

from .audit_log_test_accounts import (
    _cleanup_audit_log,
    create_system_user,
    create_verified_user,
    poll_for_entries,
    unique_email,
)

PASSWORD = "StrongPass123!"

# _cleanup_audit_log (imported above): pytest discovers autouse fixtures by
# name in a test module's own namespace, so importing it here is what
# actually activates it for this file's tests - see its docstring in
# audit_log_test_accounts.py. Not referenced directly, hence unused-import
# lint suppression.
__all__ = ["_cleanup_audit_log"]


@pytest.mark.asyncio
async def test_unauthenticated_request_is_rejected(client):
    resp = await client.get("/authorization/audit-log")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_regular_user_cannot_query_the_audit_log(client, created_emails):
    email = unique_email()
    await create_verified_user(client, created_emails, email, [SELF_SERVICE_POLICY_NAME])

    resp = await client.get("/authorization/audit-log")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_system_user_can_list_the_global_audit_log(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)

    resp = await client.get("/authorization/audit-log", params={"limit": 5})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) <= 5


@pytest.mark.asyncio
async def test_audit_log_for_unknown_user_returns_404(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)

    resp = await client.get(f"/authorization/audit-log/users/{unique_email('nobody')}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_global_audit_log_search_filters_by_user_email(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    target_email = unique_email("searchtarget")
    # Ends logged in as target_email.
    await create_verified_user(client, created_emails, target_email, [SELF_SERVICE_POLICY_NAME])

    # GET /users/me itself is an authorized action (users:read_own), so it
    # writes a real row into the authorization audit log for target_email.
    await client.get("/users/me")

    # Switch back to the system user to query the global audit log.
    login_resp = await client.post("/auth/login", json={"email": system_email, "password": PASSWORD})
    assert login_resp.status_code == 200

    async def _fetch():
        resp = await client.get("/authorization/audit-log", params={"search": target_email, "limit": 100})
        assert resp.status_code == 200
        return resp.json()

    entries = await poll_for_entries(_fetch, lambda es: len(es) > 0)
    assert entries
    assert all(e["user_email"] == target_email for e in entries)


@pytest.mark.asyncio
async def test_global_audit_log_sort_by_user_email(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)

    # Two distinct, known-orderable emails sharing a common search prefix so
    # this test's own two rows are isolated from other entries in the table.
    prefix = unique_email("sorttest").split("@")[0]
    email_a = f"{prefix}-aaa@example.com"
    email_b = f"{prefix}-bbb@example.com"
    await create_verified_user(client, created_emails, email_b, [SELF_SERVICE_POLICY_NAME])
    await client.get("/users/me")
    await create_verified_user(client, created_emails, email_a, [SELF_SERVICE_POLICY_NAME])
    await client.get("/users/me")

    login_resp = await client.post("/auth/login", json={"email": system_email, "password": PASSWORD})
    assert login_resp.status_code == 200

    async def _fetch():
        resp = await client.get(
            "/authorization/audit-log",
            params={"search": prefix, "sort_by": "user_email", "sort_dir": "asc", "limit": 100},
        )
        assert resp.status_code == 200
        return resp.json()

    entries = await poll_for_entries(
        _fetch, lambda es: {e["user_email"] for e in es} >= {email_a, email_b}
    )
    emails = [e["user_email"] for e in entries]
    assert emails == sorted(emails)
    assert email_a in emails
    assert email_b in emails
    # email_a ("...-aaa@...") must sort before email_b ("...-bbb@...").
    assert emails.index(email_a) < emails.index(email_b)


@pytest.mark.asyncio
async def test_global_audit_log_filters_by_action_and_allowed(client, created_emails):
    system_email = unique_email("system")
    await create_system_user(client, created_emails, system_email)
    target_email = unique_email("filtertarget")
    # Ends logged in as target_email.
    await create_verified_user(client, created_emails, target_email, [SELF_SERVICE_POLICY_NAME])

    # A plain user hitting GET /users/ (needs users:list_all, which it
    # lacks) writes one denied users:list_all row; GET /users/me (which it
    # holds via self_service) writes one allowed users:read_own row.
    denied_resp = await client.get("/users/")
    assert denied_resp.status_code == 403
    allowed_resp = await client.get("/users/me")
    assert allowed_resp.status_code == 200

    login_resp = await client.post("/auth/login", json={"email": system_email, "password": PASSWORD})
    assert login_resp.status_code == 200

    async def _fetch_allowed():
        resp = await client.get(
            "/authorization/audit-log",
            params={"search": target_email, "action": "users:read_own", "allowed": True, "limit": 100},
        )
        assert resp.status_code == 200
        return resp.json()

    entries = await poll_for_entries(_fetch_allowed, lambda es: len(es) > 0)
    assert entries
    assert all(e["action"] == "users:read_own" and e["allowed"] is True for e in entries)

    async def _fetch_denied():
        resp = await client.get(
            "/authorization/audit-log",
            params={"search": target_email, "action": "users:list_all", "allowed": False, "limit": 100},
        )
        assert resp.status_code == 200
        return resp.json()

    denied_entries = await poll_for_entries(_fetch_denied, lambda es: len(es) > 0)
    assert denied_entries
    assert all(e["action"] == "users:list_all" and e["allowed"] is False for e in denied_entries)
