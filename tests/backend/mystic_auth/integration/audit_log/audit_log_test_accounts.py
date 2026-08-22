# tests/backend/mystic_auth/integration/audit_log/audit_log_test_accounts.py
#
# Real signed-up, verified, policy-holding test accounts and the eventual-
# consistency polling helper, shared by test_audit_log_automatic_logging_
# integration.py and test_audit_log_query_api_integration.py. Split out of
# what used to be one test_audit_log_integration.py once that file passed
# the repo's own file-length guideline, mirroring the same
# shared-account-helpers pattern already used for
# tests/.../user_crud/user_test_accounts.py.
import asyncio
import uuid

import pytest_asyncio
from sqlalchemy import text

from backend.mystic_auth.auth.verify_account.account_verification_service import (
    account_verification_service,
)
from backend.mystic_auth.authorization.policies.default_policies import (
    SELF_SERVICE_POLICY_NAME,
    SYSTEM_SUPERUSER_POLICY_NAME,
    USER_ADMINISTRATION_POLICY_NAME,
)
from backend.mystic_auth.authorization.repositories.policy_repository import (
    policy_repository,
)
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.redis.client import redis_client
from backend.mystic_auth.user_crud.user_crud_collector import user_crud

PASSWORD = "StrongPass123!"


def unique_email(prefix: str = "inttest") -> str:
    return f"{prefix}-{uuid.uuid4().hex}@example.com"


async def poll_for_entries(fetch, predicate, timeout_seconds: float = 30.0, interval: float = 0.2):
    """Authorization audit rows are now written by a background
    Procrastinate worker (see AuthorizationService._log_decision), not
    inline on the request that triggered them: a real worker container
    picks the job up over LISTEN/NOTIFY, typically well under 100ms, but
    it's no longer guaranteed to have landed by the time the very next
    request runs. `fetch` is an async callable returning the entries list
    (e.g. one GET /authorization/audit-log call); `predicate` decides
    whether the list already contains what this test is waiting for. Polls
    up to `timeout_seconds` rather than assuming either instant visibility
    (flaky) or a fixed sleep (slow and still technically flaky under load).

    Named `timeout_seconds`, not `timeout`: ruff's ASYNC109 flags a bare
    `timeout` parameter on an async function as an anti-pattern, since
    `asyncio.timeout()` is the idiomatic way to bound an async call and a
    same-named parameter here reads as (but isn't) that. This function
    deliberately keeps its own "poll until timeout, then return whatever
    was found" contract instead: `asyncio.timeout()` raises on expiry,
    which isn't what a test polling for eventual-consistency wants here.
    """
    deadline = asyncio.get_event_loop().time() + timeout_seconds
    entries = await fetch()
    while not predicate(entries):
        if asyncio.get_event_loop().time() >= deadline:
            return entries
        await asyncio.sleep(interval)
        entries = await fetch()
    return entries


async def create_verified_user(client, created_emails, email, policy_names):
    signup_resp = await client.post(
        "/auth/signup", json={"name": "Test User", "email": email, "password": PASSWORD}
    )
    assert signup_resp.status_code == 200
    created_emails.append(email)

    token = await account_verification_service.create_verification_token(email)
    await redis_client.set(f"verify:{token}", "1", ex=600)
    verify_resp = await client.post("/auth/verify-account", json={"token": token})
    assert verify_resp.status_code == 200

    async with database.async_session() as session:
        user = await user_crud.get_by_email(email, session)
        for policy_name in policy_names:
            policy = await policy_repository.get_by_name(policy_name, session)
            await policy_repository.assign_policy_to_user(
                user_id=user.id, policy_id=policy.id, db=session, assigned_by="test"
            )

    login_resp = await client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert login_resp.status_code == 200
    return login_resp


async def create_system_user(client, created_emails, email):
    return await create_verified_user(
        client, created_emails, email,
        [SELF_SERVICE_POLICY_NAME, USER_ADMINISTRATION_POLICY_NAME, SYSTEM_SUPERUSER_POLICY_NAME],
    )


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_audit_log(created_emails):
    """Every real authorize() call in these tests writes a permanent audit
    row (by design : audit history is append-only, never cascade-deleted
    when a test user is torn down). Clean up rows for this test's emails
    specifically so repeated runs don't accumulate unbounded log rows in
    the shared test database."""
    yield
    if not created_emails:
        return
    async with database.async_session() as session:
        await session.execute(
            text("DELETE FROM authorization_audit_log WHERE user_email = ANY(:emails)"),
            {"emails": created_emails},
        )
        await session.commit()
