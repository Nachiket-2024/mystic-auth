"""Readable labels for rate-limit counters whose identifier is a keyed digest.

Account counters are keyed by a digest of the email (see valkey/key_names.py), so
that no address appears in Valkey key names, dumps or backups. That is the right
storage form but useless on the dashboard, where an operator needs to know who a
counter belongs to. This module maps a digest back to an email by recomputing the
digest for known accounts, and shows the result only in the dashboard response:
nothing readable is ever written to Valkey.

- account / email scope: the digest of one email, matched against the users table.
- account_ip scope: the digest of an email plus a source network, matched against
  recent failed attempts in the security audit log, which record both.

A digest nobody can be matched to stays unlabelled and the UI shows it shortened.
"""
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import ColumnElement, Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from ....audit_log.audit_log_model import AuditLog
from ....user.user_model import User
from ....valkey.key_names import email_key_id
from .account_keys import account_ip_digest

ACCOUNT_SCOPES = ("account", "email")
PAIR_SCOPE = "account_ip"
# Lockout counters live minutes, so a day of failures covers every live pair.
PAIR_LOOKBACK = timedelta(hours=24)
MAX_PAIR_CANDIDATES = 5000
_USER_BATCH = 1000
# Counters for these purposes are keyed with a purpose prefix (see account_ip_digest).
_PAIR_PURPOSES = (None, "stepup")


async def _emails_for_digests(db: AsyncSession, wanted: set[str]) -> dict[str, str]:
    """Match digests against every account email, stopping once all are found."""
    found: dict[str, str] = {}
    last_id = 0
    while len(found) < len(wanted):
        rows = (
            await db.execute(
                select(User.id, User.email).where(User.id > last_id).order_by(User.id).limit(_USER_BATCH)
            )
        ).all()
        if not rows:
            break
        for user_id, email in rows:
            digest = email_key_id(email)
            if digest in wanted:
                found[digest] = email
            last_id = user_id
    return found


async def _pairs_for_digests(db: AsyncSession, wanted: set[str]) -> dict[str, str]:
    """Match pair digests against (email, IP) pairs from recent failed attempts."""
    since = datetime.now(UTC) - PAIR_LOOKBACK
    # Legacy Column attributes confuse the type checker's inference of the row
    # shape, so it is stated here: both selected columns are non-null by the filter.
    query = cast(
        Select[tuple[str, str]],
        select(AuditLog.user_email, AuditLog.ip_address)
        .where(
            AuditLog.success.is_(False),
            AuditLog.user_email.is_not(None),
            AuditLog.ip_address.is_not(None),
            cast(ColumnElement[bool], AuditLog.created_at >= since),
        )
        .distinct()
        .limit(MAX_PAIR_CANDIDATES),
    )
    result = await db.execute(query)
    found: dict[str, str] = {}
    for email, ip in result:
        for purpose in _PAIR_PURPOSES:
            digest = account_ip_digest(email, ip, purpose=purpose)
            if digest in wanted:
                found[digest] = f"{email} from {ip}"
    return found


async def add_identifier_labels(db: AsyncSession, entries: list[dict[str, Any]]) -> None:
    """Set `identifier_label` on each entry whose digest can be matched to an account."""
    account_wanted = {e["identifier"] for e in entries if e["scope"] in ACCOUNT_SCOPES}
    pair_wanted = {e["identifier"] for e in entries if e["scope"] == PAIR_SCOPE}
    labels: dict[tuple[str, str], str] = {}
    if account_wanted:
        for digest, email in (await _emails_for_digests(db, account_wanted)).items():
            labels[("account", digest)] = email
    if pair_wanted:
        for digest, label in (await _pairs_for_digests(db, pair_wanted)).items():
            labels[(PAIR_SCOPE, digest)] = label
    for entry in entries:
        kind = PAIR_SCOPE if entry["scope"] == PAIR_SCOPE else "account"
        entry["identifier_label"] = labels.get((kind, entry["identifier"]))
