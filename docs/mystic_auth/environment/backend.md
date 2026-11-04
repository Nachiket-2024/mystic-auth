# Environment Configuration: Backend Settings
---

*New to a term here? See the [Infrastructure Glossary](../glossary/infrastructure.md).*

These are the template's fields, declared in the upstream-owned
`backend/mystic_auth/core/settings.py`. Pydantic loads them from the process
environment or the mode's `env/mystic_auth/.env.dev` plus `env/app/.env.dev` files.
For downstream-only fields, add an app-owned settings class under
`backend/app/core/` and document those fields with the app rather than changing this
table or `core/settings.py`; see [Building On This Template](../template-usage/customization.md#backend-customization).

| Variable | Type | Required | Actual use |
|---|---|---|---|
| `BACKEND_BASE_URL` | string URL | yes | Public backend origin. Used in deployment docs and should match JWT issuer/audience planning. |
| `FRONTEND_BASE_URL` | string URL | yes | Primary frontend origin. Used for CORS, OAuth error redirects, verification links, password-reset links, account-delete confirmation links, and successful OAuth dashboard redirects. |
| `FRONTEND_ADDITIONAL_BASE_URLS` | comma-separated string | yes, can be empty | Extra CORS-allowed origins only. Redirect and email links still use `FRONTEND_BASE_URL`. |
| `WEBAUTHN_RP_ID` | hostname | no, blank derives it from `FRONTEND_BASE_URL` | Passkey relying-party ID: a bare hostname with no scheme, path, or port. Keep it stable once users enroll passkeys, or their credentials stop working. See [Passkeys](../authentication/passkeys.md#relying-party-configuration-and-domains). |
| `WEBAUTHN_ORIGINS` | comma-separated string | no, blank uses `FRONTEND_BASE_URL` | Exact browser origins allowed to run passkey ceremonies. Each hostname must equal or be a subdomain of the RP ID. HTTPS only, except `localhost`. |
| `WEBAUTHN_RP_NAME` | string | no, blank uses `APP_NAME` | Product name shown by authenticators. |
| `WEBAUTHN_CHALLENGE_TTL_SECONDS` | integer seconds | no, defaults to `300` (allowed 60 to 600) | Lifetime of a one-time passkey challenge. Expired rows are swept hourly. |
| `DATABASE_URL` | async SQLAlchemy Postgres URL | yes | Alembic migrations, Procrastinate connector after dialect rewrite, and app DB access when `APP_DATABASE_URL` is empty. |
| `POSTGRES_USER` | string | yes | Postgres container setup and backup/restore scripts. |
| `POSTGRES_PASSWORD` | string secret | yes | Postgres container password. Rotate for real deployments. |
| `POSTGRES_DB` | string | yes | Main application database name. Backup scripts also use it. |
| `APP_DATABASE_URL` | async SQLAlchemy Postgres URL | no | Least-privilege app and worker DB connection. Empty means fall back to `DATABASE_URL`. |
| `DB_POOL_SIZE` | integer | yes | Per-process SQLAlchemy connection pool size. |
| `DB_MAX_OVERFLOW` | integer | yes | Extra connections opened beyond `DB_POOL_SIZE` under burst load. |
| `UVICORN_WORKERS` | integer | no, prod-shaped Compose files only | Not read by the app itself - interpolated straight into the `backend` service's `command:` (`--workers`). Ignored by `dev` (`--reload` forces one process). See [Deployment: Environment §7](../deployment/scaling.md#1-sizing-workers-on-one-host). |
| `SECRET_KEY` | string secret | yes | JWT signing for access, refresh, verification, password reset, and account-delete confirmation tokens. Must be at least 32 characters or startup fails. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | integer | yes | Access-token expiry and `access_token` cookie `max_age`. |
| `REFRESH_TOKEN_EXPIRE_MINUTES` | integer | yes | Refresh-token expiry, refresh cookie `max_age`, token-version key TTL, and rotation-chain validity. |
| `JWT_ALGORITHM` | string | yes | Algorithm passed to PyJWT encode/decode. |
| `JWT_ISSUER` | string | yes | Expected `iss` claim. Tokens with a different issuer are rejected. |
| `JWT_AUDIENCE` | string | yes | Expected `aud` claim. Tokens with a different audience are rejected. |
| `RESET_TOKEN_EXPIRE_MINUTES` | integer | yes | Password-reset token lifetime and account-verification token lifetime. |
| `ACCOUNT_DELETE_TOKEN_EXPIRE_MINUTES` | integer | yes | OAuth-only self-delete confirmation link lifetime. |
| `GOOGLE_CLIENT_ID` | string | yes, can be placeholder until OAuth is used | Google OAuth2 client id used by the login redirect and token exchange. |
| `GOOGLE_CLIENT_SECRET` | string secret | yes, can be placeholder until OAuth is used | Google OAuth2 token exchange secret. |
| `GOOGLE_REDIRECT_URI` | string URL | yes | Must exactly match the callback URL registered in Google Cloud. |
| `VALKEY_URL` | Valkey URL | yes | Valkey client connection for rate limits, lockout, cached token versions, OAuth state, policy cache, and Pub/Sub. Durable token versions and refresh-token single-use claims are stored in Postgres. |
| `CACHE_DEFAULT_TTL` | integer seconds | yes | Default Valkey cache TTL used by the authorization cache. |
| `FROM_EMAIL` | email string | yes | SMTP username and email `From` address. |
| `GMAIL_APP_PASSWORD` | string secret | yes, can be placeholder if email disabled | SMTP password for the Gmail sender account. |
| `SUPPORT_EMAIL` | email string | yes, can be empty | Email `Reply-To`, legal page contact, and optional sidebar support link. Empty falls back to `FROM_EMAIL` for email sending. |
| `SMTP_HOST` | string | yes | SMTP server hostname. |
| `SMTP_PORT` | integer | yes | SMTP server port. Gmail STARTTLS uses `587`. |
| `EMAIL_ENABLED` | boolean | no, defaults true | `false` uses `NullEmailSender`, logging email instead of opening SMTP. Tests force this false. |
| `APP_NAME` | string | yes | Product name in API root response, email templates, and frontend build arg alias. |
| `EMAIL_LOGO_PATH` | file path | no, default empty | Optional PNG, JPEG or GIF (max 256 KB) shown at the top of verification and password-reset emails instead of the badge generated from `BRAND_COLOR`. The path is inside the backend and worker containers, so mount the file read-only into both. Unusable files fall back to the generated badge with a warning. See [Where the brand shows up](../appearance/overview.md#where-the-brand-shows-up). |
| `BRAND_COLOR` | `#rrggbb` | no, default `#b5533c` | Same value the frontend reads as `VITE_BRAND_COLOR`. The backend uses it for the accent color and the generated badge in verification and password-reset emails, so one env value re-skins both. The emails never use `VITE_APP_LOGO_URL`, `VITE_APP_FAVICON_URL`, a user's own color pick, or `theme.ts`; see [Where the brand shows up](../appearance/overview.md#where-the-brand-shows-up). Anything other than a 6-digit hex fails at startup. |
| `LOGIN_LOCKOUT_TIME` | integer seconds | yes | Default lockout duration for email-scoped one-time protected actions such as password reset, verification, and account deletion confirmation. |
| `MAX_FAILED_LOGIN_ATTEMPTS` | integer | yes | Default failed-attempt threshold for those email-scoped protected actions. Login itself uses the account/source-IP pair settings below. |
| `LOGIN_LOCKOUT_TIME_PER_IP` | integer seconds | yes | Lockout duration for one normalized account/source-IP pair after repeated failed logins. The legacy variable name is retained for existing env files. |
| `MAX_FAILED_LOGIN_ATTEMPTS_PER_IP` | integer | yes | Failed-login threshold for one normalized account/source-IP pair. The legacy variable name is retained for existing env files. |
| `ACTION_RESERVATION_TIME` | integer seconds | no, defaults to `60` | Valkey reservation lifetime used to serialize concurrent password-reset, verification, and account-deletion confirmations. Keep it longer than the slowest expected mutation, but shorter than the user-facing lockout window. |
| `REFRESH_TOKEN_REUSE_GRACE_SECONDS` | integer seconds | no, defaults to `10` | Same-IP duplicate refresh grace window. A retry inside the window is rejected without revoking the first request; an older or cross-IP replay revokes its chain. |
| `SESSION_ROW_RETENTION_HOURS` | integer hours | no, defaults to `1` | Retention buffer for naturally expired session rows before the daily cleanup job removes them. |
| `SESSION_EVENT_MAX_CONNECTIONS_PER_ACCOUNT` | integer | no, defaults to `5` | Global maximum concurrent authenticated SSE session-event streams for one account. |
| `SESSION_EVENT_MAX_CONNECTIONS_PER_IP` | integer | no, defaults to `20` | Global maximum concurrent authenticated SSE session-event streams for one client IP. |
| `SESSION_EVENT_LEASE_GRACE_SECONDS` | integer seconds | no, defaults to `30` | Crash-recovery cushion added to the SSE lease, which lasts about a minute, is renewed while the stream is open and is released when the client disconnects. |
| `MAX_REQUESTS_PER_WINDOW` | integer | yes | Shared request count for the generic auth route rate limiter. |
| `REQUEST_WINDOW_SECONDS` | integer seconds | yes | Shared fixed-window length for the generic auth route rate limiter. |
| `LOG_LEVEL` | string | yes | Application logger level. Used by `logging_config.py`. |
| `ENVIRONMENT` | string | yes | `production` disables `/docs`, `/redoc`, and `/openapi.json`; also changes logging format and HSTS behavior. |
| `TRUSTED_PROXY_IPS` | comma-separated IPs | no, defaults empty | Immediate proxy IPs allowed to supply `X-Forwarded-For`. Empty means never trust that header. Only the `backend` service needs a real value (Compose derives and overrides it there); `alembic`/`procrastinate_worker` don't use it and can rely on the default. |
| `GEOIP_DB_PATH` | filesystem path | yes, can be empty | MaxMind GeoLite2-City `.mmdb` path. Empty disables session geolocation and shows "Unknown". |
| `SENTRY_DSN` | DSN string | yes, can be empty | Backend Sentry-protocol DSN. Empty disables backend error monitoring. |
| `SENTRY_ENVIRONMENT` | string | yes, can be empty | Backend error-monitoring environment tag. Empty falls back to `ENVIRONMENT`. |
| `SECURITY_ALERT_WEBHOOK_URL` | HTTPS URL (or `http://<compose-service>:port/...` for a service on the private Docker network), optional outside production | no, defaults empty | HTTPS `POST` endpoint supplied by an incident gateway or generic webhook receiver. It receives refresh-token reuse, SSE-cap, and account-lockout alerts. Production startup fails if this is empty, so security alerts cannot be silently disabled. See [Direct security-alert webhook](../error-monitoring/overview.md#direct-security-alert-webhook). |
| `SECURITY_ALERT_WEBHOOK_FORMAT` | `json` or `ntfy`, optional | no, defaults `json` | `ntfy` posts a readable text message with title and priority headers, for ntfy.sh or a self-hosted ntfy server; `json` posts the generic alert object. See [ntfy setup](../error-monitoring/ntfy-alerts.md). |
| `SECURITY_ALERT_WEBHOOK_TOKEN` | secret, optional | no, defaults empty | Bearer credential issued by that receiver; sent only in the `Authorization` header and never logged. |
| `SECURITY_ALERT_WEBHOOK_TIMEOUT_SECONDS` | number, optional | no, defaults `2` | Maximum wait for the receiver. Delivery is best effort and never blocks authentication. |
| `ACCOUNT_PURGE_GRACE_DAYS` | integer days | yes | Grace period before the scheduled purge job hard-deletes soft-deleted accounts. |
| `PROCRASTINATE_TASK_IMPORT_PATHS` | comma-separated module paths | no, defaults empty | Downstream task modules imported by the worker and API process. Use app-owned modules only, for example `app.background_tasks`. A module may define `@procrastinate_app.task` tasks or register lifecycle listeners. |
| `PROCRASTINATE_WORKER_MIDDLEWARE_PATHS` | comma-separated callable paths | no, defaults empty | Optional worker-wide Procrastinate middleware, loaded from app-owned modules. Paths may use `module:function` or `module.function` syntax. Middleware must not log task arguments. |
| `USER_EXPORT_MAX_ROWS` | integer | yes | Maximum rows returned by `GET /users/export`; larger filtered exports return `400 EXPORT_TOO_LARGE`. |

---

`SettingsConfigDict(extra="ignore")` is intentional. The same env files also
feed Compose services that need variables the FastAPI app does not read, such
as `BUGSINK_*`, tunnel credentials, and backup settings. See
[Compose-Only Settings](compose.md).

---

See [Environment Configuration](README.md) for the full index.

---

## Defaulted tuning settings

These have working defaults and are deliberately absent from the env examples. Set one in the matching env file only to change the behavior; each links to the page that explains it.

| Variable | Default | Purpose |
|---|---|---|
| `PASSWORD_HASH_CONCURRENCY` | `1` | Argon2 hashes allowed to run at once per worker process. See [Abuse prevention](../security/hardening-abuse-prevention.md). |
| `PASSWORD_HASH_MAX_WAITING` | `2` | Hashes allowed to queue behind those per worker; beyond that the request gets 503 with `Retry-After`. |
| `LOGIN_ACCOUNT_FAILURE_THRESHOLD` | `20` | Failed logins for one account, from any source, inside the window before the cool-down starts. |
| `LOGIN_ACCOUNT_FAILURE_WINDOW_SECONDS` | `900` | Window for the count above. |
| `LOGIN_ACCOUNT_COOLDOWN_SECONDS` | `30` | While cooling down, the account accepts one login attempt per this many seconds (a cool-down, not a lock). |
| `STALLED_JOB_MAX_ATTEMPTS` | `3` | Times a job whose worker died mid-run is re-queued before it is marked failed and alerted. See [Background workers](../background-workers/procrastinate.md). |
| `FAILED_JOB_RETENTION_DAYS` | `30` | Days a failed, aborted or cancelled job stays in `procrastinate_jobs` before the daily sweep removes it. |

---

## App-owned extension setting

`DEFAULT_APP_POLICIES` is deliberately not part of the upstream `Settings`
model. It is declared by `backend/app/core/settings.py` and configured in the
matching `env/app/.env.<mode>` file. It contains comma-separated policy names
assigned to each verified user alongside `self_service`; names are trimmed and
deduplicated. Downstream projects extend `backend/app/core/settings.py` for their
own settings instead of editing `backend/mystic_auth/core/settings.py`.

---
