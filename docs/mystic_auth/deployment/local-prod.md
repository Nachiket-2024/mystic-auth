# Local-Prod Deployment

Self-hosted production image/runtime shape from your own machine or home
server. The code is baked into images, reload is off, bind mounts are gone,
and Cloudflare Tunnel exposes the app to the internet without your own public
IP, router port forwarding, or Caddy.

Not sure this is the mode you want? See the
[dev vs. local-prod vs. prod comparison](guide.md#at-a-glance) in the
Deployment Guide.

---

## Which mode do I want?

There are two ways to expose your local-prod stack to the internet, both
via Cloudflare Tunnel. Pick one and follow that section start to finish:
each is a complete, standalone walkthrough, so you don't need to read the
other one first.

- **Quick Tunnel**: zero Cloudflare account, zero domain, up in a couple
  of minutes. The public URL is random and changes every time you restart
  the stack. Good for a quick test. See [Quick Tunnel](quick-tunnel.md).
- **Named Tunnel**: needs a domain on a free Cloudflare account. A bit
  more setup, but the URL is stable, so you configure Google login once
  and never touch it again. See [Named Tunnel](named-tunnel.md).

Not sure local-prod itself is the mode you want (vs. dev or prod)? See the
[dev vs. local-prod vs. prod comparison](guide.md#at-a-glance) in the
Deployment Guide.

---

## Environment variables

`.env.local-prod.example` is the source of truth for local-prod values. Copy
it to `.env.local-prod` (not `.env` - that's dev's file). It is set up for
Cloudflare Quick Tunnel, same-origin API routing, production mode, and the
fixed frontend nginx proxy IP.

Rotate the secrets in the copied `.env.local-prod` before real use. Review
`FRONTEND_BASE_URL`, `BACKEND_BASE_URL`, `GOOGLE_REDIRECT_URI`, SMTP,
rate-limit, Redis, and error-monitoring values before sharing the service.

Build-time values must be final before you run `--build`:

- `VITE_API_BASE_URL`: keep empty for the bundled nginx same-origin proxy.
- `VITE_APP_NAME`: public app name shown in the browser (aliased from
  `APP_NAME` by the compose file - set `APP_NAME`, not this).
- `VITE_SUPPORT_EMAIL`: contact address on the Terms of Service / Privacy
  Policy pages (aliased from `SUPPORT_EMAIL` - set `SUPPORT_EMAIL`, not this).
- `VITE_SENTRY_DSN`: public browser DSN if frontend error reporting is enabled.
- `VITE_SENTRY_ENVIRONMENT`: frontend environment tag.

Runtime values can be changed with a container restart:

- `SECRET_KEY`, `DATABASE_URL`, `POSTGRES_*`, `REDIS_URL`, and
  `REDIS_PASSWORD`
- `FRONTEND_BASE_URL`, `BACKEND_BASE_URL`, `GOOGLE_REDIRECT_URI`
- SMTP settings, rate-limit settings, and backend `SENTRY_DSN`

`VITE_API_BASE_URL`, `VITE_APP_NAME`, `VITE_SUPPORT_EMAIL`, `VITE_SENTRY_DSN`,
and `VITE_SENTRY_ENVIRONMENT` are baked in at image build time, not read at
container runtime. Set them (or their aliased `APP_NAME`/`SUPPORT_EMAIL`
source vars) in `.env.local-prod` before `--build`, not after. Always run
Compose with `--env-file .env.local-prod` (or `scripts/docker/local-prod-up.sh`
/ `.ps1` / `.cmd`, which does this for you) - without it, `${VAR}` build-arg
substitution silently falls back to whatever's in a plain `.env` instead.
See
[Deployment Guide: required production environment variables](guide.md#required-production-environment-variables)
for the full explanation of each.

Session geolocation (`GEOIP_DB_PATH`/`GEOIPUPDATE_*`) is covered as an
optional step in [Quick Tunnel](quick-tunnel.md) and
[Named Tunnel](named-tunnel.md), since it needs an extra flag on the
"start the stack" command in each.

---

## What's different from dev / prod

See [Docker Overview: dev vs. production compose](../docker/overview.md#dev-vs-production-compose)
for the full table. In short: no bind mounts, no reload, `unless-stopped`
restart policy, `alembic` gates `backend`/`procrastinate_worker` startup, and TLS
terminates at Cloudflare's edge rather than in a container you run.

Use `docker-compose.prod.yml` instead (see [Prod Deployment](prod.md)) if
you'd rather the host itself own the public IP and terminate TLS via Caddy,
for example on your own server.
