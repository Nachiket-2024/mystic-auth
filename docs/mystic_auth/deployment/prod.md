# Prod Deployment
---

*New to a term here? See the [Infrastructure Glossary](../glossary/infrastructure.md).*

Self-hosted deployment for your own server. This can be a virtual private
server, cloud instance, bare-metal server, or any host with a public IP. The
Compose stack owns the public HTTP/HTTPS entrypoint through Caddy, which
terminates TLS with automatic Let's Encrypt certificates. Use this instead of
[Local-Prod](local-prod/README.md) when traffic should reach the server directly
rather than route from your own machine through a tunnel. If you do
not have a public server, see [Local-Prod Deployment](local-prod/README.md) instead.

Not sure this is the mode you want? See the
[dev vs. local-prod vs. prod comparison](guide.md#1-deployment-modes) in the
Deployment Guide.

---

## Getting started

**Step 1: Confirm prerequisites.**

- A host that can run Docker Compose continuously, with a public IP.
- A domain whose DNS already points at that host's public IP, required
  *before* first start, or certificate issuance fails.
- Network access for SMTP email delivery.
- Google OAuth2 credentials if Google login is enabled.

---

**Step 2: Copy the env file and fill in your domain.**

```bash
cp env/.env.prod.example env/.env.prod
```

Or run `scripts/mystic_auth/env-tools/setup-env/setup-env.sh` (`.ps1`/`.cmd`) instead: it does
this copy (and every other mode's) in one pass, generating a distinct
random secret per password field, so most of "Also rotate ..." below is
already done for a freshly created file.

`env/.env.prod.example` is the prod template for `docker/compose/docker-compose.prod.yml`.
`ENVIRONMENT=production` and empty `VITE_API_BASE_URL` are already set correctly for
the bundled Caddy to frontend nginx to backend route. `TRUSTED_PROXY_IPS` isn't set
directly there - `docker-compose.prod.yml` derives it from `FRONTEND_STATIC_IP`/
`CADDY_STATIC_IP` (also in that file), so it can't drift out of sync with the actual
pinned addresses.

Before starting, replace every `<your-domain>` placeholder in the copied
`env/.env.prod` with your real domain:

- `PUBLIC_DOMAIN`
- `FRONTEND_BASE_URL`
- `BACKEND_BASE_URL`
- `JWT_ISSUER` and `JWT_AUDIENCE`, minted into every access/refresh/verify
  JWT and checked back on `verify_token()`; leaving these at the
  `<your-domain>` placeholder breaks every login
- `GOOGLE_REDIRECT_URI`, if Google login is enabled
- `BUGSINK_BASE_URL`, if Bugsink is publicly routed

Also rotate `SECRET_KEY`, `POSTGRES_PASSWORD`, `BUGSINK_SECRET_KEY`, and
`BUGSINK_SUPERUSER_PASSWORD`. `REDIS_PASSWORD` is optional (blank ships as a
working default since Redis has no host port exposed in this mode); set one
only if you want it, and rewrite `REDIS_URL` to embed it too, since setting
`REDIS_PASSWORD` alone does nothing - see
[Redis authentication](../security/hardening-infra.md#redis-authentication).
Rotate `APP_DATABASE_URL`'s password alongside `DATABASE_URL`'s if you keep
the least-privilege app role enabled (the default; see
[Deployment Guide: Database migrations](migrations-and-backups.md#1-database-migrations)).
Configure SMTP before
opening password signup to users, because unverified password accounts cannot
log in. Configure Google OAuth2 before showing Google login. The CLI-created
system superuser can sign in without Google or SMTP because the script marks it
verified. See [System Superuser](../authentication/system-superuser/README.md) for
the interactive command, or `local-scripts/mystic_auth/prod/create-system-user.*` for a
non-interactive version (fill in real production credentials, not the dev
placeholder). See also
[Environment variables](#environment-variables) below for the runtime rules and
[Choosing the right env template](environment.md#1-choosing-the-right-env-template)
for the mode comparison.

---

**Step 3: Start the stack.**

Run `scripts/mystic_auth/env-tools/check-env/check-env.sh env/.env.prod` (`.ps1`/`.cmd`) first.
It fails if a secret in that file still equals the shipped placeholder
while `ENVIRONMENT=production`, and warns on any remaining `<your_...>`
placeholder or a host port already in use, before you spend a `--build`
finding out the hard way.

```bash
docker compose -f docker/compose/docker-compose.prod.yml --env-file env/.env.prod up -d --build
```

Only Caddy (ports 80/443) is published to the host. `postgres`, `redis`,
`backend`, and `frontend` stay reachable container-to-container by service
name. Nothing outside the Docker network can reach them directly.

---

**Step 3b (Optional): Enable session geolocation.**

Setting `GEOIP_DB_PATH`/`GEOIPUPDATE_ACCOUNT_ID`/`GEOIPUPDATE_LICENSE_KEY` in
`env/.env.prod` alone does nothing: the `geoipupdate` service that downloads the
`.mmdb` file is gated behind the `geoip` Compose profile, skipped by Step 3's
command as written. Re-run Step 3 with the profile added instead:

```bash
docker compose -f docker/compose/docker-compose.prod.yml --env-file env/.env.prod --profile geoip up -d --build
```

Without it, Manage Sessions' Location column silently shows "Unknown" with
nothing in the logs to say why. See
[Session Geolocation](../geolocation/overview.md)
for the MaxMind account/license-key setup this depends on.

---

**Step 4: Open the app.**

`https://PUBLIC_DOMAIN`. Caddy issues the TLS certificate on first
request, so the very first load may take a few extra seconds.

---

## How routing works

The frontend container's nginx (`docker/nginx.frontend.conf`) proxies API
route prefixes (`/auth`, `/audit`, `/users`, `/authorization`, `/health`,
`/rate-limits`) to `backend`. It's pinned to `FRONTEND_STATIC_IP` so the
backend can trust its `X-Forwarded-For` header via `TRUSTED_PROXY_IPS`
(derived from `FRONTEND_STATIC_IP`/`CADDY_STATIC_IP`, see
[Routing: Trusted proxy IPs](routing.md#2-trusted-proxy-ips)).

---

## Environment variables

`env/.env.prod.example` is the source of truth for prod values. It is set up for
Caddy-managed TLS, same-origin API routing, production mode, and the fixed
frontend nginx proxy IP.

Rotate the secrets in the copied `env/.env.prod` before real use. Review
`PUBLIC_DOMAIN`, `ACME_EMAIL`, `BUGSINK_PUBLIC_DOMAIN`, `FRONTEND_BASE_URL`,
`BACKEND_BASE_URL`, `GOOGLE_REDIRECT_URI`, SMTP, rate-limit, Redis, and
error-monitoring values before opening the service.

Build-time values must be final before you run `--build`:

- `VITE_API_BASE_URL`: keep empty for the bundled nginx same-origin proxy.
- `VITE_APP_NAME`: public app name shown in the browser.
- `VITE_SENTRY_DSN`: public browser DSN if frontend error reporting is enabled.
- `VITE_SENTRY_ENVIRONMENT`: frontend environment tag.

Runtime values can be changed with a container restart:

- `PUBLIC_DOMAIN`, `ACME_EMAIL`, and `BUGSINK_PUBLIC_DOMAIN`
- `SECRET_KEY`, `DATABASE_URL`, `POSTGRES_*`, `REDIS_URL`, and
  `REDIS_PASSWORD`
- `FRONTEND_BASE_URL`, `BACKEND_BASE_URL`, `GOOGLE_REDIRECT_URI`
- SMTP settings, rate-limit settings, and backend `SENTRY_DSN`

`VITE_API_BASE_URL`, `VITE_APP_NAME`, `VITE_SENTRY_DSN`, and
`VITE_SENTRY_ENVIRONMENT` are baked in at image build time, not read at
container runtime. Set them in `env/.env.prod` before `--build`, not after. See
[Deployment Guide: required production environment variables](environment.md#5-required-production-review)
for the full explanation of each.

---

## What's different from dev / local-prod

See [Docker Overview: dev vs. production compose](../docker/compose-modes.md#dev-vs-production-compose)
for the full table. Same production image/runtime shape as local-prod (no
bind mounts, no reload, `alembic` gates startup), but Caddy replaces the
tunnel (Cloudflare, ngrok, or Tailscale Funnel) as the public entrypoint and
TLS terminator.

---

## Backups, migrations, graceful shutdown, limitations

These are the same across every Compose file. See
[Deployment Guide](migrations-and-backups.md#1-database-migrations) for migrations, backups
(`scripts/mystic_auth/db/db_backup.sh docker-compose.prod.yml`), graceful shutdown, and
known limitations of this deployment approach.

---