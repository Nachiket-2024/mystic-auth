import ipaddress

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

    Both local-prod and prod chain TWO reverse proxies in front of backend
    (cloudflared/Caddy, then frontend's nginx), each of which appends its own
    hop to X-Forwarded-For rather than overwriting it (nginx's
    proxy_add_x_forwarded_for; Caddy's reverse_proxy default). So this walks
    the header from the right, discarding entries that are themselves one of
    TRUSTED_PROXY_IPS's known proxy hops, and returns the first entry that
    isn't - the closest entry no configured proxy could have appended on the
    caller's behalf. A caller connecting directly (bypassing every trusted
    hop, e.g. local-prod's frontend port published for debugging) can prepend
    as many fake entries as it likes, but the right-most entry is always the
    real address nginx (or Caddy) saw it connect from, and that address can
    never itself land in TRUSTED_PROXY_IPS - so the walk always stops there,
    never at a forged entry.

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
    if not entries:
        return peer_ip

    for entry in reversed(entries):
        if entry not in _TRUSTED_PROXY_IPS:
            return entry

    # Every entry was itself a trusted proxy hop (e.g. proxies talking to
    # each other with no real client attached) - nothing left to trust.
    return peer_ip


def ip_bucket(ip: str | None) -> str:
    """Identifier for per-source counters (rate limits, lockouts).

    IPv4 addresses are used as they are. An IPv6 customer normally controls a
    whole /64, so counting per single address would let one attacker rotate
    through billions of addresses and never reach a limit. All addresses in
    one /64 therefore share a bucket. The text has no ':' because the Rate
    Limits dashboard splits keys on that character.
    """
    if not ip:
        return "unknown"
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped is not None:
            return str(address.ipv4_mapped)
        groups = address.exploded.split(":")[:4]
        return "v6-" + "-".join(groups)
    return str(address)
