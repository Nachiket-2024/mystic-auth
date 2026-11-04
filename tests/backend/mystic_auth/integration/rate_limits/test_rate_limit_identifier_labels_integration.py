# GET /rate-limits/ shows who a digest-keyed counter belongs to. Counters are
# stored under a keyed digest of the email (no address in Valkey key names); the
# response adds `identifier_label` by matching known accounts and recent failed
# attempts, against the real app, PostgreSQL and Valkey.
import uuid

import pytest

from backend.mystic_auth.audit_log.audit_log_model import AuditLog
from backend.mystic_auth.auth.security.rate_limiting import rate_limit_identifier_labels
from backend.mystic_auth.auth.security.rate_limiting.account_keys import (
    account_ip_digest,
)
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.valkey.client import valkey_client
from backend.mystic_auth.valkey.key_names import email_key_id

from ..authorization.authorization_test_accounts import cleanup_test_policies
from .test_rate_limit_routes_integration import _create_user_with_rate_limits_read

__all__ = ["cleanup_test_policies"]


def _endpoint() -> str:
    return f"test_labels_{uuid.uuid4().hex}"


async def _entries(client, endpoint):
    resp = await client.get("/rate-limits/", params={"endpoint": endpoint})
    assert resp.status_code == 200
    return {entry["key"]: entry for entry in resp.json()["entries"]}


@pytest.mark.asyncio
async def test_account_counter_is_labelled_with_the_accounts_email(client, created_emails):
    email = await _create_user_with_rate_limits_read(client, created_emails)
    endpoint = _endpoint()
    account_key = f"{endpoint}:account:{email_key_id(email)}"
    unknown_key = f"{endpoint}:account:{email_key_id('nobody-' + uuid.uuid4().hex + '@example.com')}"
    ip_key = f"{endpoint}:ip:203.0.113.9"
    try:
        for key in (account_key, unknown_key, ip_key):
            await valkey_client.set(key, "1", ex=300)

        entries = await _entries(client, endpoint)

        assert entries[account_key]["identifier_label"] == email
        assert entries[unknown_key]["identifier_label"] is None
        assert entries[ip_key]["identifier_label"] is None
    finally:
        await valkey_client.delete(account_key, unknown_key, ip_key)


@pytest.mark.asyncio
async def test_accounts_beyond_the_first_user_batch_are_still_found(client, created_emails, monkeypatch):
    first = await _create_user_with_rate_limits_read(client, created_emails)
    second = await _create_user_with_rate_limits_read(client, created_emails)
    monkeypatch.setattr(rate_limit_identifier_labels, "_USER_BATCH", 1)
    endpoint = _endpoint()
    keys = [f"{endpoint}:email:{email_key_id(email)}" for email in (first, second)]
    try:
        for key in keys:
            await valkey_client.set(key, "1", ex=300)

        entries = await _entries(client, endpoint)

        assert [entries[key]["identifier_label"] for key in keys] == [first, second]
    finally:
        await valkey_client.delete(*keys)


@pytest.mark.asyncio
async def test_lockout_pair_is_labelled_from_a_recent_failed_attempt(client, created_emails):
    email = await _create_user_with_rate_limits_read(client, created_emails)
    ip = "203.0.113.77"
    endpoint = _endpoint()
    login_key = f"{endpoint}:account_ip:{account_ip_digest(email, ip)}"
    step_up_key = f"{endpoint}:account_ip:{account_ip_digest(email, ip, purpose='stepup')}"
    other_ip_key = f"{endpoint}:account_ip:{account_ip_digest(email, '198.51.100.8')}"
    async with database.async_session() as session:
        session.add(AuditLog(user_email=email, event_type="login_failure", success=False, ip_address=ip))
        await session.commit()
    try:
        for key in (login_key, step_up_key, other_ip_key):
            await valkey_client.set(key, "2", ex=300)

        entries = await _entries(client, endpoint)

        assert entries[login_key]["identifier_label"] == f"{email} from {ip}"
        assert entries[step_up_key]["identifier_label"] == f"{email} from {ip}"
        # No failed attempt from this address was recorded, so it cannot be matched.
        assert entries[other_ip_key]["identifier_label"] is None
    finally:
        await valkey_client.delete(login_key, step_up_key, other_ip_key)
