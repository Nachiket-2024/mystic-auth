# Environment Configuration
---

This page documents every environment variable this repository currently
ships in `env/*.example`, grouped by the code that reads it. Use it with the
deployment walkthroughs:

1. Dev: copy `env/.env.example` to `env/.env`.
1. Local-prod Cloudflare: copy `env/.env.local-prod-cloudflare.example` to
  `env/.env.local-prod-cloudflare`.
1. Local-prod ngrok: copy `env/.env.local-prod-ngrok.example` to
  `env/.env.local-prod-ngrok`.
1. Local-prod Tailscale: copy `env/.env.local-prod-tailscale.example` to
  `env/.env.local-prod-tailscale`.
1. Prod: copy `env/.env.prod.example` to `env/.env.prod`.

`backend/app/main.py` loads `env/.env` before importing `app.sdk` in dev. In
local-prod and prod, Compose passes the mode-specific env file into each
service through `env_file:` and also needs `--env-file` for `${VAR}` build
argument substitution.

> Diagram omitted. See the surrounding prose, tables, or numbered steps for the same flow.


---

## Backend Settings

These fields are declared in `backend/mystic_auth/core/settings.py`. Pydantic
loads them from process environment or `env/.env`.

| Variable | Type | Required | Actual use |
|---|---|---|---|
| `BACKEND_BASE_URL` | string URL | yes | Public backend origin. Used in deployment docs and should match JWT issuer/audience planning. |
| `FRONTEND_BASE_URL` | string URL | yes | Primary frontend origin. Used for CORS, OAuth error redirects, verification links, password-reset links, account-delete confirmation links, and successful OAuth dashboard redirects. |
| `FRONTEND_ADDITIONAL_BASE_URLS` | comma-separated string | yes, can be empty | Extra CORS-allowed origins only. Redirect and email links still use `FRONTEND_BASE_URL`. |
| `DATABASE_URL` | async SQLAlchemy Postgres URL | yes | Alembic migrations, Procrastinate connector after dialect rewrite, and app DB access when `APP_DATABASE_URL` is empty. |
| `POSTGRES_USER` | string | yes | Postgres container setup and backup/restore scripts. |
| `POSTGRES_PASSWORD` | string secret | yes | Postgres container password. Rotate for real deployments. |
| `POSTGRES_DB` | string | yes | Main application database name. Backup scripts also use it. |
| `APP_DATABASE_URL` | async SQLAlchemy Postgres URL | no | Least-privilege app and worker DB connection. Empty means fall back to `DATABASE_URL`. |
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
| `REDIS_URL` | Redis URL | yes | Redis client connection for rate limits, lockout, token versions, single-use refresh claims, OAuth state, policy cache, and Pub/Sub. |
| `CACHE_DEFAULT_TTL` | integer seconds | yes | Default Redis cache TTL used by the authorization cache. |
| `FROM_EMAIL` | email string | yes | SMTP username and email `From` address. |
| `GMAIL_APP_PASSWORD` | string secret | yes, can be placeholder if email disabled | SMTP password for the Gmail sender account. |
| `SUPPORT_EMAIL` | email string | yes, can be empty | Email `Reply-To`, legal page contact, and optional sidebar support link. Empty falls back to `FROM_EMAIL` for email sending. |
| `SMTP_HOST` | string | yes | SMTP server hostname. |
| `SMTP_PORT` | integer | yes | SMTP server port. Gmail STARTTLS uses `587`. |
| `EMAIL_ENABLED` | boolean | no, defaults true | `false` uses `NullEmailSender`, logging email instead of opening SMTP. Tests force this false. |
| `APP_NAME` | string | yes | Product name in API root response, email templates, and frontend build arg alias. |
| `LOGIN_LOCKOUT_TIME` | integer seconds | yes | Account lockout duration after too many failed logins for one email. |
| `MAX_FAILED_LOGIN_ATTEMPTS` | integer | yes | Failed login threshold per account. |
| `LOGIN_LOCKOUT_TIME_PER_IP` | integer seconds | yes | IP lockout duration after too many failed login attempts across accounts. |
| `MAX_FAILED_LOGIN_ATTEMPTS_PER_IP` | integer | yes | Failed login threshold per IP. |
| `MAX_REQUESTS_PER_WINDOW` | integer | yes | Shared request count for the generic auth route rate limiter. |
| `REQUEST_WINDOW_SECONDS` | integer seconds | yes | Shared fixed-window length for the generic auth route rate limiter. |
| `LOG_LEVEL` | string | yes | Application logger level. Used by `logging_config.py`. |
| `ENVIRONMENT` | string | yes | `production` disables `/docs`, `/redoc`, and `/openapi.json`; also changes logging format and HSTS behavior. |
| `TRUSTED_PROXY_IPS` | comma-separated IPs | yes, can be empty | Immediate proxy IPs allowed to supply `X-Forwarded-For`. Empty means never trust that header. |
| `GEOIP_DB_PATH` | filesystem path | yes, can be empty | MaxMind GeoLite2-City `.mmdb` path. Empty disables session geolocation and shows "Unknown". |
| `SENTRY_DSN` | DSN string | yes, can be empty | Backend Sentry-protocol DSN. Empty disables backend error monitoring. |
| `SENTRY_ENVIRONMENT` | string | yes, can be empty | Backend error-monitoring environment tag. Empty falls back to `ENVIRONMENT`. |
| `DEFAULT_APP_POLICIES` | comma-separated policy names | yes, can be empty | Extra policy names assigned to each verified user alongside `self_service`. Parsed, trimmed, and deduplicated. |
| `ACCOUNT_PURGE_GRACE_DAYS` | integer days | yes | Grace period before the scheduled purge job hard-deletes soft-deleted accounts. |
| `USER_EXPORT_MAX_ROWS` | integer | yes | Maximum rows returned by `GET /users/export`; larger filtered exports return `400 EXPORT_TOO_LARGE`. |
---

`SettingsConfigDict(extra="ignore")` is intentional. The same env files also
feed Compose services that need variables the FastAPI app does not read, such
as `BUGSINK_*`, tunnel credentials, and backup settings.

---

## Frontend Build Settings

These are read through `import.meta.env` in the browser code. In production
style Docker modes they are baked into the static bundle during
`docker/dockerfiles/frontend.Dockerfile`'s `builder` stage. Changing one means
rebuilding the frontend image.

| Variable | Reader | Actual use |
|---|---|---|
| `VITE_API_BASE_URL` | `frontend/src/mystic_auth/core/settings.ts` | Axios base URL, OAuth login button URL, and SSE session-events URL. Empty means same-origin API calls through nginx. |
| `VITE_APP_NAME` | `frontend/src/mystic_auth/core/settings.ts` | Product name shown in the UI and document title. Compose aliases it from `APP_NAME`. |
| `VITE_APP_LOGO_URL` | `frontend/src/mystic_auth/core/settings.ts` | Optional image `src` for `Logo.tsx` in the sidebar and auth layout. Not aliased from a backend variable. |
| `VITE_SUPPORT_EMAIL` | `frontend/src/mystic_auth/core/settings.ts` | Legal/contact display and optional sidebar support link. Compose aliases it from `SUPPORT_EMAIL`. |
| `VITE_BRAND_COLOR` | `frontend/src/mystic_auth/core/settings.ts` | App-wide default brand color. Empty falls back to `#d97706`. Compose aliases it from `BRAND_COLOR`. |
| `VITE_SENTRY_DSN` | `frontend/src/mystic_auth/core/errorMonitoring.ts` | Browser error-monitoring DSN. Empty disables frontend error monitoring. |
| `VITE_SENTRY_ENVIRONMENT` | `frontend/src/mystic_auth/core/errorMonitoring.ts` | Browser error-monitoring environment tag. Empty falls back to Vite's `MODE`. |

---

## Compose-Only Settings

These values are not `Settings` fields. They are read by Docker Compose,
container entrypoints, one-shot seed commands, or local helper scripts.

| Variable | Modes | Actual use |
|---|---|---|
| `APP_DB_PASSWORD` | all env examples | Read by Alembic migration `b1e6a9f3c7d2_add_least_privilege_app_role.py` to create or update the least-privilege app role used by `APP_DATABASE_URL`. |
| `REDIS_PASSWORD` | all env examples | Used by the Redis container and included in `REDIS_URL`. |
| `BUGSINK_SECRET_KEY` | all env examples | Django secret key for Bugsink. Must be a real long value or Bugsink fails its deploy checks and crash-loops. |
| `BUGSINK_SUPERUSER_EMAIL` | all env examples | Bugsink admin username/email and the switch that lets the backend watch for a late seeded DSN in dev/local stacks. |
| `BUGSINK_SUPERUSER_PASSWORD` | all env examples | Bugsink admin password. |
| `BUGSINK_BASE_URL` | all env examples | Internal or public Bugsink base URL, depending on mode. |
| `GEOIPUPDATE_ACCOUNT_ID` | local-prod and prod | MaxMind account id used by the optional `geoipupdate` service. Requires `--profile geoip`. |
| `GEOIPUPDATE_LICENSE_KEY` | local-prod and prod | MaxMind license key used by the optional `geoipupdate` service. Requires `--profile geoip`. |
| `BACKUP_INTERVAL_HOURS` | local-prod and prod | Sleep interval for the always-on `db_backup` sidecar. Defaults to `24` if Compose substitution gets an empty value. |
| `BACKUP_RETENTION_DAYS` | local-prod and prod | Local dump retention for the `db_backup` sidecar. Defaults to `14` if Compose substitution gets an empty value. |
| `TUNNEL_TOKEN` | local-prod Cloudflare named tunnel | Cloudflare Tunnel token consumed by the `cloudflared` container. Not needed for Cloudflare Quick Tunnel. |
| `NGROK_AUTHTOKEN` | local-prod ngrok | ngrok account auth token consumed by the `ngrok` container. |
| `NGROK_DOMAIN` | local-prod ngrok | Static ngrok domain used by the tunnel command and public base URLs. |
| `TS_AUTHKEY` | local-prod Tailscale | Tailscale auth key consumed by the `tailscale` container. |
| `TS_HOSTNAME` | local-prod Tailscale | Tailscale machine name used by the Funnel setup. |
| `PUBLIC_DOMAIN` | prod | Public app domain used by Caddy routing. |
| `ACME_EMAIL` | prod | Email address Caddy passes to Let's Encrypt for certificate management. |
| `BUGSINK_PUBLIC_DOMAIN` | prod | Public Bugsink domain used by Caddy routing and public frontend DSN planning. |

---

## Edge Cases

1. `SECRET_KEY` shorter than 32 characters stops backend startup at settings
  import time.
1. `FRONTEND_ADDITIONAL_BASE_URLS` affects CORS only. It never changes email
  links or OAuth redirects.
1. `TRUSTED_PROXY_IPS` must name the immediate proxy that connects to the
  backend, not the public client IP. If the peer is not trusted, forged
  `X-Forwarded-For` is ignored.
1. Frontend `VITE_*` variables in production-style modes are build-time values.
  Restarting the container is not enough after changing them.
1. `APP_DATABASE_URL` can be blank. When set, the app and Procrastinate task
  bodies use it for CRUD work, while Alembic still uses `DATABASE_URL` for DDL.
1. `GEOIP_DB_PATH` alone does not download a database. Docker downloads the
  MaxMind file only when `geoipupdate` is enabled with `--profile geoip`.
1. `EMAIL_ENABLED=false` lets flows enqueue and render email content without
  contacting SMTP, but users still need the resulting token/link through logs
  or tests to finish verification or reset flows.

---
