# tests/backend/mystic_auth/integration/audit_log/test_security_audit_log_integration.py
#
# End-to-end coverage for the persistent security audit log
# (audit_log/audit_log_model.py, audit_log/audit_log_repository.py, and the
# /audit/security-log query routes) against the real ASGI app, real
# PostgreSQL, and real Valkey. Security-sensitive auth events (login,
# logout, signup, etc.) must be persisted automatically, and the query API
# itself must be PBAC-gated (security_audit:read).
import uuid

import pytest_asyncio
from sqlalchemy import text

from backend.mystic_auth.auth.verify_account.account_verification_service import (
    account_verification_service,
)
from backend.mystic_auth.authorization.policies.default_policies import (
    SELF_SERVICE_POLICY_NAME,
    SYSTEM_SUPERUSER_POLICY_NAME,
    USER_MANAGEMENT_POLICY_NAME,
)
from backend.mystic_auth.authorization.repositories.policy_repository import (
    policy_repository,
)
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.user.user_crud_collector import user_crud
from backend.mystic_auth.valkey.client import valkey_client

PASSWORD = "StrongPass123!"


def _unique_email(prefix: str = "inttest") -> str:
    return f"{prefix}-{uuid.uuid4().hex}@example.com"


async def _create_verified_user(client, created_emails, email, policy_names):
    signup_resp = await client.post(
        "/auth/signup", json={"name": "Test User", "email": email, "password": PASSWORD}
    )
    assert signup_resp.status_code == 200
    created_emails.append(email)

    token = await account_verification_service.create_verification_token(email)
    await valkey_client.set(f"verify:{token}", "1", ex=600)
    verify_resp = await client.post("/auth/verify-account", json={"token": token})
    assert verify_resp.status_code == 200

    async with database.async_session() as session:
        user = await user_crud.get_by_email(email, session)
        for policy_name in policy_names:
            policy = await policy_repository.get_by_name(policy_name, session)
            await policy_repository.assign_policy_to_user(
                user_id=user.id, policy_id=policy.id, db=session, assigned_by="test"
            )

    login_resp = await client.post(
        "/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert login_resp.status_code == 200
    return login_resp


async def _create_system_user(client, created_emails, email):
    return await _create_verified_user(
        client,
        created_emails,
        email,
        [
            SELF_SERVICE_POLICY_NAME,
            USER_MANAGEMENT_POLICY_NAME,
            SYSTEM_SUPERUSER_POLICY_NAME,
        ],
    )


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_security_audit_log(created_emails):
    """Security audit rows are append-only and not cascade-deleted with a
    test user, so clean up rows for this test's emails so repeated runs
    don't accumulate unbounded log rows in the shared test database."""
    yield
    if not created_emails:
        return
    async with database.async_session() as session:
        await session.execute(
            text("DELETE FROM security_audit_log WHERE user_email = ANY(:emails)"),
            {"emails": created_emails},
        )
        await session.commit()
