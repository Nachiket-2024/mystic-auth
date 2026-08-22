# tests/backend/mystic_auth/integration/audit_log/test_audit_log_automatic_logging_integration.py
#
# End-to-end coverage for the persistent authorization audit log
# (authorization/models/audit_log_model.py, .../repositories/audit_log_repository.py)
# against the real ASGI app, real PostgreSQL, and real Redis. The PBAC audit
# logging requirement item #1: "Authorization decisions must be auditable" :
# every real authorize()/require() call (i.e. every hit on a PBAC-protected
# route) must write a row automatically, with no route needing to opt in.
#
# Split out of test_audit_log_integration.py once that file passed the
# repo's own file-length guideline; this half covers only automatic logging
# on real protected routes. See test_audit_log_query_api_integration.py for
# the audit-log query API's own PBAC gating/search/sort/filter coverage.
import asyncio

import pytest

from backend.mystic_auth.authorization.policies.default_policies import (
    SELF_SERVICE_POLICY_NAME,
    USER_ADMINISTRATION_POLICY_NAME,
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
async def test_a_successful_protected_action_is_logged_as_allowed(client, created_emails):
    admin_email = unique_email("admin")
    system_email = unique_email("system")
    await create_verified_user(client, created_emails, admin_email, [SELF_SERVICE_POLICY_NAME, USER_ADMINISTRATION_POLICY_NAME])
    await create_system_user(client, created_emails, system_email)

    login_resp = await client.post("/auth/login", json={"email": admin_email, "password": PASSWORD})
    assert login_resp.status_code == 200
    list_resp = await client.get("/users/")
    assert list_resp.status_code == 200

    # Query the audit log as the system user. The write happens in a
    # background worker (see poll_for_entries), so poll rather than assume
    # it's already landed.
    await client.post("/auth/login", json={"email": system_email, "password": PASSWORD})

    async def _fetch():
        resp = await client.get(f"/authorization/audit-log/users/{admin_email}")
        assert resp.status_code == 200
        return resp.json()

    def _has_match(entries):
        return any(e["action"] == "users:list_all" and e["resource_type"] == "users" for e in entries)

    entries = await poll_for_entries(_fetch, _has_match)

    matching = [e for e in entries if e["action"] == "users:list_all" and e["resource_type"] == "users"]
    assert len(matching) >= 1
    assert matching[0]["allowed"] is True
    assert "user_administration" in matching[0]["granting_policy_names"]


@pytest.mark.asyncio
async def test_a_denied_protected_action_is_logged_as_denied(client, created_emails):
    plain_email = unique_email("plain")
    system_email = unique_email("system")
    await create_verified_user(client, created_emails, plain_email, [SELF_SERVICE_POLICY_NAME])
    await create_system_user(client, created_emails, system_email)

    login_resp = await client.post("/auth/login", json={"email": plain_email, "password": PASSWORD})
    assert login_resp.status_code == 200
    denied_resp = await client.get("/users/")
    assert denied_resp.status_code == 403

    await client.post("/auth/login", json={"email": system_email, "password": PASSWORD})

    async def _fetch():
        resp = await client.get(f"/authorization/audit-log/users/{plain_email}")
        assert resp.status_code == 200
        return resp.json()

    entries = await poll_for_entries(_fetch, lambda es: any(e["action"] == "users:list_all" for e in es))

    matching = [e for e in entries if e["action"] == "users:list_all"]
    assert len(matching) >= 1
    assert matching[0]["allowed"] is False
    assert matching[0]["granting_policy_names"] == []


@pytest.mark.asyncio
async def test_inspection_endpoint_does_not_pollute_the_audit_log(client, created_emails):
    # authorization-check calls authorize_detailed directly (a hypothetical
    # "what would happen if" query) : it must never itself write an audit
    # entry, only the real authorize()/require() calls that gate actual
    # routes do.
    target_email = unique_email("target")
    system_email = unique_email("system")
    await create_verified_user(client, created_emails, target_email, [SELF_SERVICE_POLICY_NAME])
    await create_system_user(client, created_emails, system_email)

    check_resp = await client.post(
        f"/authorization/users/{target_email}/authorization-check",
        json={"action": "users:purge", "resource_type": "users"},
    )
    assert check_resp.status_code == 200

    # Give a (real, if wrongly present) queued job time to land before
    # asserting absence, since writes are now async: an immediate check
    # would pass even if this endpoint incorrectly queued an entry.
    await asyncio.sleep(1)
    log_resp = await client.get(f"/authorization/audit-log/users/{target_email}")
    assert log_resp.status_code == 200
    entries = log_resp.json()

    assert all(e["action"] != "users:purge" for e in entries)
