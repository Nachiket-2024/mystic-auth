"""Versioned, keyed identifiers for durable token-revocation rows."""

import hashlib
import hmac

from ...core.settings import settings


def _digest(namespace: str, value: str) -> str:
    message = f"mystic-auth:token-revocation:v2:{namespace}:{value}".encode()
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()


def account_version_key(email: str) -> str:
    return f"account_ver:v2:{_digest('email', email.strip().casefold())}"


def chain_version_key(email: str, chain_id: str) -> str:
    email_digest = _digest("email", email.strip().casefold())
    return f"chain_ver:v2:{email_digest}:{chain_id}"


def legacy_account_version_key(email: str) -> str:
    return f"account_ver:{email}"


def legacy_chain_version_key(email: str, chain_id: str) -> str:
    return f"chain_ver:{email}:{chain_id}"


def hmac_key_from_legacy_key(key: str) -> str | None:
    """Translate a legacy database key to its non-reversible v2 identifier."""
    if key.startswith("account_ver:") and not key.startswith("account_ver:v2:"):
        email = key.removeprefix("account_ver:")
        return account_version_key(email) if email else None
    if key.startswith("chain_ver:") and not key.startswith("chain_ver:v2:"):
        value = key.removeprefix("chain_ver:")
        email, separator, chain_id = value.rpartition(":")
        return chain_version_key(email, chain_id) if separator and email and chain_id else None
    return None
