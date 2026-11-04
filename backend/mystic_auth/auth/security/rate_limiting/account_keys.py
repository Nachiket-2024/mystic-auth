"""Key helpers for rate-limit and lockout counters: account_key_func helpers for
@rate_limiter_service.rate_limited, and the account + source IP lockout digest."""
import hashlib
import hmac

from ....core.settings import settings
from ...token_logic.jwt_service import jwt_service
from ..client_ip import ip_bucket


def account_ip_digest(email: str, client_ip: str | None, *, purpose: str | None = None) -> str:
    """Keyed digest of one account seen from one source network, for login_lock keys.

    The Rate Limits dashboard rebuilds this same value from known (email, IP)
    pairs to show who a counter belongs to, so every lockout key must be built
    here. `purpose` separates counters that must not share a bucket (the
    passkey step-up check uses "stepup").
    """
    parts = [email.strip().casefold(), ip_bucket(client_ip)]
    if purpose:
        parts.insert(0, purpose)
    pair = "\0".join(parts).encode()
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), pair, hashlib.sha256).hexdigest()


async def access_token_account_key(kwargs: dict) -> str | None:
    """account_key_func for token-only routes (get_current_user, logout,
    logout_all, list_sessions, revoke_session): none of these has a
    request-body email field, only an access_token cookie. Reads it from a
    declared `access_token` Cookie() param where present, otherwise from
    `request` directly, covering both route styles with one function.

    Uses jwt_service.decode_payload, not verify_token: verifies signature
    and expiry (never trusts a tampered token as an account key) but skips
    verify_token's durable revocation/version checks, since those decide
    whether to let the *request* through, not which rate-limit bucket to
    use. Missing/invalid/expired token returns None, same as any other
    account_key_func miss: the caller falls back to IP-only rate limiting
    instead of failing the request.
    """
    access_token = kwargs.get("access_token")
    if not access_token:
        request = kwargs.get("request")
        access_token = request.cookies.get("access_token") if request else None

    if not access_token:
        return None

    payload = await jwt_service.decode_payload(access_token)
    return payload.get("email") if payload else None
