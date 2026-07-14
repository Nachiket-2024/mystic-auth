# Security Hardening

Consolidates the concrete hardening mechanisms in the codebase — rate limiting, lockout, response headers, CORS, and cookie flags. For the *why* behind non-obvious choices, see [Security Decisions](decisions.md).

## Rate limiting

`backend/app/auth/security/rate_limiter_service.py` — a generic sliding-window-by-fixed-bucket limiter backed by Redis (`INCR` + `EXPIRE` on first request in a window), applied via the `@rate_limiter_service.rate_limited("endpoint_name", account_key_func=...)` decorator on every route in `auth_routes.py` (signup, login, OAuth2 initiate/callback, `/auth/me`, logout, logout-all, password-reset request/confirm, verify-account) and `refresh_token_routes.py`.

- **Always applies a per-IP limit** (`{endpoint_name}:ip:{ip}`), resolved via [`core/client_ip.py`](../authorization/architecture.md#authorization-context-builder) (trusted-proxy-aware).
- **Optionally applies a per-account limit** when `account_key_func` is given (e.g. signup/password-reset-request key on the submitted email) — closes the gap where an attacker spreads requests targeting one account across many source IPs to stay under the per-IP threshold alone.
- Both limits are configured by `MAX_REQUESTS_PER_WINDOW` / `REQUEST_WINDOW_SECONDS` (`.env.example`) — one shared threshold/window for every rate-limited endpoint, not per-endpoint tunable today (see [Concerns](../concerns/README.md)).
- **Fails closed on Redis error**: `record_request` catches all exceptions, logs them, and returns `False` ("not allowed") — a Redis outage makes every rate-limited request appear over-limit and get rejected with `429`, rather than silently disabling rate limiting. This is the opposite tradeoff from the PBAC authorization cache, which fails open to the authoritative database on a Redis error — see [PBAC Troubleshooting: Redis cache management](../authorization/troubleshooting.md#redis-cache-management) for that contrast. Practical implication: a Redis outage makes the API fully unusable for any rate-limited auth route, not just slower.

## Brute-force lockout

`backend/app/auth/security/login_protection_service.py` — separate from and layered on top of the generic rate limiter (see [Security Decisions: rate limiting and lockout are layered](decisions.md#rate-limiting-and-lockout-are-layered-not-singular)):

- Per-account: `MAX_FAILED_LOGIN_ATTEMPTS` failures within `LOGIN_LOCKOUT_TIME` seconds locks that email out.
- Per-IP: `MAX_FAILED_LOGIN_ATTEMPTS_PER_IP` failures within `LOGIN_LOCKOUT_TIME_PER_IP` seconds locks that IP out across *any* account it targets.
- `check_and_record_action` double-checks `is_locked` both before and after the expensive password-hash comparison, closing a race where a concurrent request crosses the threshold mid-check.
- Both counters use `INCR`/`EXPIRE`-on-first-failure (not sliding), so the lockout window is fixed from the *first* failure, not extended by each subsequent one.

## Timing-attack resistance

See [Security Decisions: timing-attack mitigations](decisions.md#timing-attack-mitigations) — applied at login (dummy-hash comparison), signup (unconditional hashing), and password-reset-request (identical generic response).

## Security response headers

`backend/app/core/security_headers_middleware.py`, applied to every response:

| Header | Value | Reasoning |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Stops MIME-type sniffing |
| `X-Frame-Options` | `DENY` | This is a JSON API with no HTML pages — no framing use case exists |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | Same rationale — zero functional cost since there's no HTML/script to allow |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Forces HTTPS for a year, protecting the cookies from protocol downgrade |
| `Referrer-Policy` | `no-referrer` | URLs here can carry sensitive query params (OAuth2 `state`/`code`) |

Note: no `Strict-Transport-Security` is set by the nginx layer serving the frontend static build (`docker/nginx.frontend.conf`) — HSTS is only emitted by the backend API responses. See [Docker Overview](../docker/overview.md).

## CORS

`backend/app/main.py` — `CORSMiddleware` allows exactly one origin (`settings.FRONTEND_BASE_URL`), `allow_credentials=True` (required for cookie-based auth to work cross-origin in dev, where frontend `:5173` and backend `:8000` are different origins), methods restricted to `GET/POST/PUT/PATCH/DELETE`, headers restricted to `Content-Type`.

## Cookies

| Cookie | Path | Flags | Set by |
|---|---|---|---|
| `access_token` | `/` | `httponly`, `secure`, `samesite=Strict` | `token_cookie_handler.py` |
| `refresh_token` | `/auth` | `httponly`, `secure`, `samesite=Strict` | `token_cookie_handler.py` |
| `oauth_state` | `/` | `httponly`, `secure`, `samesite=Lax` (must survive Google's cross-site redirect) | `oauth2_login_handler.py` |

`secure=True` on every cookie means **local HTTP development requires the browser to treat `localhost` as a secure context** (modern browsers do this automatically for `localhost`) — this will not work over plain HTTP on a non-localhost hostname.

## Middleware ordering

`main.py` adds `CORSMiddleware`, `LoggingMiddleware`, `SecurityHeadersMiddleware`, then `CorrelationIdMiddleware` last — Starlette applies middleware in reverse of add order, so `CorrelationIdMiddleware` ends up outermost, ensuring `request.state.request_id` (and the logging contextvar it sets) is populated before any other middleware or route logic runs.

## Error handling

A single global exception handler (`main.py`) catches every otherwise-unhandled exception, logs it with a full traceback, and returns a generic `500 {"detail": "Internal Server Error"}` — internal exception details never reach the client. See [API Reference: error responses](../api/reference.md#error-responses).

## Known accepted gaps

See [Security Decisions: known accepted gaps / follow-ups](decisions.md#known-accepted-gaps--follow-ups) and [Concerns](../concerns/README.md) for the current tracked list (Redis auth, `SECRET_KEY` strength enforcement, automated backups).
