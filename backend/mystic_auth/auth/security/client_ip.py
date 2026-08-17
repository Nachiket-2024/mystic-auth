from fastapi import Request

from ...core.settings import settings

# Empty by default (TRUSTED_PROXY_IPS unset), so every caller falls back to the
# literal TCP peer address exactly as before. Only becomes non-empty in a
# deployment that explicitly configures its reverse proxy's own address(es),
# opting in to trusting X-Forwarded-For.
_TRUSTED_PROXY_IPS = frozenset(
    ip.strip() for ip in settings.TRUSTED_PROXY_IPS.split(",") if ip.strip()
)


def get_client_ip(request: Request) -> str | None:
    """
    Resolves the real client IP for audit logging, rate limiting, and
    authorization context (including PBAC's NetworkCondition, which gates
    access on this value - see conditions/network_condition.py).

    request.client.host is the literal TCP peer: in a direct deployment (no
    reverse proxy) this is already the real client; behind a reverse proxy
    it's the proxy's own address instead. The X-Forwarded-For header is only
    trusted if that TCP peer is itself one of this deployment's configured
    reverse proxies (TRUSTED_PROXY_IPS), otherwise any internet client could
    set X-Forwarded-For to whatever it likes and impersonate any IP.

    When trusted, the RIGHT-most entry is used, not the left-most: nginx's
    proxy_pass appends the real client to whatever X-Forwarded-For it
    received rather than overwriting it, so a client that connects directly
    to the trusted proxy can freely prepend fake entries of its own (e.g.
    "X-Forwarded-For: 10.0.0.1") before ever reaching it. With only a single
    trusted hop configured here, the entry the trusted proxy itself appended
    - the last one - is the only one that cannot have been forged by the
    caller; trusting the first entry instead would let any caller spoof
    their apparent IP and bypass IP-restricted PBAC policies outright.

    Returns None if request.client is unavailable (e.g. a test client with no
    real transport).
    """
    peer_ip = request.client.host if request.client else None

    if not _TRUSTED_PROXY_IPS or peer_ip not in _TRUSTED_PROXY_IPS:
        return peer_ip

    forwarded_for = request.headers.get("x-forwarded-for")
    if not forwarded_for:
        return peer_ip

    entries = [entry.strip() for entry in forwarded_for.split(",") if entry.strip()]
    return entries[-1] if entries else peer_ip
