# Security Hardening: HTTP Layer

Response headers, CORS, cookie flags, middleware ordering, and error handling: the mechanisms that shape what the HTTP layer itself exposes to a client. See [Security Hardening](hardening.md) for the full index.

## Security response headers

`backend/mystic_auth/auth/security/security_headers_middleware.py`, applied to every response:

| Header | Value | Reasoning |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Stops MIME-type sniffing |
| `X-Frame-Options` | `DENY` | This is a JSON API with no HTML pages of its own beyond the auto-generated docs below: no framing use case exists |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` on every route except `/docs`/`/redoc`/`/openapi.json` (see below) | Zero functional cost on the real API surface since there's no HTML/script to allow |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only: see below) | Forces HTTPS for a year, protecting the cookies from protocol downgrade |
| `Referrer-Policy` | `no-referrer` | URLs here can carry sensitive query params (OAuth2 `state`/`code`) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | This is a JSON API with no page of its own that would ever invoke these browser features: denying them closes off a class of clickjacking-adjacent abuse at zero functional cost |

**HSTS is gated on `settings.ENVIRONMENT == "production"`** (checked fresh per request, not cached at import time). Sending it unconditionally would pin HSTS for a full year against real browser traffic even in a non-production deployment served over plain HTTP, with no way to turn it off short of a code change: browsers ignore the header over plain HTTP today, but that's not a reason to send a year-long pin somewhere it isn't intended to apply yet.

**`/docs`, `/redoc`, and `/openapi.json` get a relaxed CSP, carved out by request path.** FastAPI's auto-generated Swagger UI (`/docs`) and ReDoc (`/redoc`) pages: enabled whenever `ENVIRONMENT != "production"`, see `backend/app/main.py`: are the one place this API actually serves HTML, and both load their JS/CSS from a CDN (`cdn.jsdelivr.net`) plus an inline `<script>`/`<style>` block; ReDoc additionally pulls a Google Fonts stylesheet. The blanket `default-src 'none'` policy used to apply here too, which didn't error or warn: the page returned 200 and rendered as silently blank, every asset blocked with nothing in the response to say why. `security_headers_middleware.py`'s `_DOCS_PATHS`/`_DOCS_CSP` scope a permissive-but-specific policy (`cdn.jsdelivr.net`, `fonts.googleapis.com`/`fonts.gstatic.com`, `'unsafe-inline'`) to exactly those three paths; every other route keeps the strict policy above.

Note: no `Strict-Transport-Security` is set by the nginx layer serving the frontend static build (`docker/nginx.frontend.conf`): HSTS is only emitted by the backend API responses. See [Docker Overview](../docker/overview.md).

---

## CORS

`backend/app/main.py`: `CORSMiddleware` allows `settings.cors_allowed_origins` (`FRONTEND_BASE_URL` plus any comma-separated `FRONTEND_ADDITIONAL_BASE_URLS`; single-origin by default), `allow_credentials=True` (required for cookie-based auth to work cross-origin in dev, where frontend `:5173` and backend `:8000` are different origins), methods restricted to `GET/POST/PUT/PATCH/DELETE`, headers restricted to `Content-Type`. Redirect/email links (OAuth callback, verification, password reset) always point at `FRONTEND_BASE_URL` alone regardless of how many origins are CORS-allowed: there's always exactly one canonical link target.

---

## Cookies

| Cookie | Path | Flags | Set by |
|---|---|---|---|
| `access_token` | `/` | `httponly`, `secure`, `samesite=Strict` | `token_cookie_handler.py` |
| `refresh_token` | `/auth` | `httponly`, `secure`, `samesite=Strict` | `token_cookie_handler.py` |
| `oauth_state` | `/` | `httponly`, `secure`, `samesite=Lax` (must survive Google's cross-site redirect) | `oauth2_login_handler.py` |

`secure=True` on every cookie means **local HTTP development requires the browser to treat `localhost` as a secure context** (modern browsers do this automatically for `localhost`): this will not work over plain HTTP on a non-localhost hostname.

---

## Middleware ordering

`main.py` adds `CORSMiddleware`, `LoggingMiddleware`, `SecurityHeadersMiddleware`, then `CorrelationIdMiddleware` last: Starlette applies middleware in reverse of add order, so `CorrelationIdMiddleware` ends up outermost, ensuring `request.state.request_id` (and the logging contextvar it sets) is populated before any other middleware or route logic runs.

---

## Error handling

Two handlers registered in `main.py`. A global `@app.exception_handler(Exception)` catches every otherwise-unhandled exception, logs it with a full traceback, and returns a generic `500 {"detail": "Internal Server Error"}`: internal exception details never reach the client, regardless of `ENVIRONMENT`; `debug=` is never passed to the FastAPI app either (defaults `False`), so there's no path where Starlette's own debug error page could leak a traceback. This same handler also reports the exception for error monitoring (`error_monitoring.sentry_service.capture_exception`): a no-op unless `SENTRY_DSN` is set, see [Error Monitoring](../error-monitoring/overview.md).

A second, more specific `@app.exception_handler(AppError)` catches `core/errors.py`'s `AppError`, the structured exception routes raise on purpose (`AppError(status_code, code, detail, params=None)`), and returns `{"detail", "code", "params"}` instead of the generic body above. `code` is a stable, machine-readable identifier (e.g. `"INVALID_CREDENTIALS"`); the frontend's `api/apiError.ts` looks it up in `errors.json` to render a translated message, falling back to the English `detail` for any route not yet migrated to `AppError`. See [API Reference: error responses](../api/reference.md#error-responses) and [Translations Overview](../translations/overview.md#5-backend-error-codes-frontendsrcmystic_authapiapierrorts).
