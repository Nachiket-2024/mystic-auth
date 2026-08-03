# Deployment Guide

---

## Dev vs Production vs Real Deployment

There are three Compose files:

| | `docker-compose.yml` | `docker-compose.local-prod.yml` | `docker-compose.prod.yml` |
|---|---|---|---|
| Purpose | Local development | Production-style local or self-hosted run behind an external TLS layer | Internet-facing VPS-style deployment with Caddy-managed TLS |
| Frontend | Vite dev server (HMR) | nginx serving the static build | nginx serving the static build |
| Source code | Bind-mounted from host | Baked into the image | Baked into the image |
| Backend/worker reload | `--reload` on file change | Off | Off |
| Restart policy | None (you restart manually) | `unless-stopped` | `unless-stopped` |
| TLS | None (plain HTTP) | None; assumes an external terminator | Caddy, automatic Let's Encrypt certs |
| Ports published to host | frontend/backend/postgres/redis, all on `localhost` | frontend (80) and backend (8000) | only Caddy (80/443); everything else is internal-only |

Local development:

```bash
./scripts/dev-up.sh      # Git Bash, WSL, Linux, macOS
.\scripts\dev-up.ps1     # PowerShell
scripts\dev-up.cmd       # Command Prompt
```

Use plain `docker compose up` when you want every service's logs interleaved.
See [Docker Overview](../docker/overview.md#day-to-day-dev-up-helpers).

Production-style local or self-hosted run behind an external URL/TLS layer:

```bash
docker compose -f docker-compose.local-prod.yml up -d --build
```

`docker-compose.local-prod.yml` assumes another reverse proxy or TLS terminator
owns the public URL and TLS.
It exposes plain HTTP on ports 80 for the frontend and 8000 for the backend,
and it does not provision certificates itself. See [Docker Overview](../docker/overview.md).

Internet-facing VPS-style deployment:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

`docker-compose.prod.yml` is for a VPS or similar generous free or low-cost
host where the Compose stack owns the public entrypoint. It adds a `caddy`
service that terminates TLS itself (automatic Let's Encrypt certificates from
`PUBLIC_DOMAIN`; see `docker/Caddyfile`) and is the only service with ports
published to the host.
`postgres`, `redis`, `backend`, and `frontend` stay reachable
container-to-container by service name, but nothing outside the Docker
network can reach them directly. Set `PUBLIC_DOMAIN` (and ideally
`ACME_EMAIL`) in `.env` before the first `up`, and make sure DNS for that
domain already points at the host's public IP, or certificate issuance
fails.

The frontend container's nginx (`docker/nginx.frontend.conf`) also proxies API
route prefixes to the backend. It forwards `/auth`, `/audit`, `/users`,
`/authorization`, and `/health` to the `backend` service. In both
production-style Compose files, the frontend container is pinned to
`172.28.0.10` so the backend can list that address in `TRUSTED_PROXY_IPS` and
trust its `X-Forwarded-For` header.

This single-origin setup works when `VITE_API_BASE_URL` is empty and
`TRUSTED_PROXY_IPS=172.28.0.10`. Both values are documented in `.env.example`.
If your TLS terminator sits in front of this nginx, forward to port 80 and let
nginx proxy the API paths internally. `proxy_add_x_forwarded_for` appends rather
than overwrites, so the client IP chain is preserved.

If you deploy the frontend elsewhere, point `VITE_API_BASE_URL` at the backend's
real public origin. Set `TRUSTED_PROXY_IPS` to the proxy that actually sits in
front of the backend for that topology.

**Testing `docker-compose.local-prod.yml` locally:** all Compose files share the root
`.env`; there is no separate `.env.prod`. The default
`FRONTEND_BASE_URL=http://localhost:5173` points at the dev Vite port, while
production Compose serves the frontend on port 80 through nginx. Set
`FRONTEND_BASE_URL=http://localhost` before a local production test, then set it
back to `http://localhost:5173` before returning to the dev-up helper. In a real
deployment, `FRONTEND_BASE_URL` is your actual domain and is set once.

---

## Required production environment variables

Same variables as `.env.example`, with these called out for production:

- `ENVIRONMENT=production` disables `/docs`, `/redoc`, and `/openapi.json` on
  the backend. See `backend/app/main.py`.
- Generate or rotate `SECRET_KEY`, `GOOGLE_CLIENT_SECRET`,
  `GMAIL_APP_PASSWORD`, and `POSTGRES_PASSWORD` for production. Do not reuse
  local `.env` or CI values.
- Point `FRONTEND_BASE_URL` and `BACKEND_BASE_URL` at the real production
  hostnames. CORS in `backend/app/main.py` allows `FRONTEND_BASE_URL` plus
  comma-separated `FRONTEND_ADDITIONAL_BASE_URLS`. Leave the additional list
  unset for a single-origin deployment.
- Set `TRUSTED_PROXY_IPS` to your reverse proxy's address when a proxy sits in
  front of the backend. This lets rate limiting, lockout, and audit logging read
  the real client IP from `X-Forwarded-For`. Leave it unset for direct backend
  traffic. See [Security Hardening](../security/hardening.md#rate-limiting) and
  [Authorization Context Builder](../authorization/architecture.md#authorization-context-builder).
- `SENTRY_DSN` and `VITE_SENTRY_DSN` are optional. Leave them unset to disable
  error monitoring. If you enable self-hosted Bugsink in production, set real
  values for `BUGSINK_SECRET_KEY`, `BUGSINK_SUPERUSER_EMAIL`,
  `BUGSINK_SUPERUSER_PASSWORD`, and `BUGSINK_BASE_URL`.
- `SENTRY_DSN` and `VITE_SENTRY_DSN` differ in self-hosted Bugsink setups.
  `SENTRY_DSN` is backend-only and can use `bugsink:8000`; `bugsink-seed`
  auto-wires it through the shared volume. `VITE_SENTRY_DSN` is baked into the
  browser bundle at build time and must use the public route to Bugsink. See
  [Error Monitoring](../error-monitoring/overview.md).
- `VITE_API_BASE_URL`, `VITE_APP_NAME`, `VITE_SENTRY_DSN`, and
  `VITE_SENTRY_ENVIRONMENT` are consumed at **image build time**, not container
  runtime. `docker-compose.local-prod.yml` and `docker-compose.prod.yml` pass them to
  `docker/frontend.Dockerfile` as build args. Set them in the root `.env` before
  `docker compose -f docker-compose.local-prod.yml up -d --build` or
  `docker compose -f docker-compose.prod.yml up -d --build`; values only in
  `frontend/.env` are invisible to Compose interpolation.

---

## Database migrations

The `alembic` service runs `alembic upgrade head` once and exits. `backend` and
`taskiq_worker` both wait on it using Compose's `service_completed_successfully`
condition, so nothing serves traffic against an unmigrated schema.

Before applying a migration in production, review the generated script under
`backend/alembic/versions/`, especially anything that drops or alters a column
or table. Alembic autogenerate is a starting point, not a safety guarantee.

---

## Backups

`scripts/db_backup.sh` and `scripts/db_restore.sh` wrap the `pg_dump` and `psql`
commands below. They read `POSTGRES_USER` and `POSTGRES_DB` from `.env`, run
through Docker Compose, and make no cloud or provider assumptions.

```bash
# Dump the running postgres service to backups/<db>-<timestamp>.sql
scripts/db_backup.sh
# Against the production compose file instead of the dev one:
scripts/db_backup.sh docker-compose.local-prod.yml

# Restore a dump. Use -y to skip confirmation.
scripts/db_restore.sh backups/mystic_auth-20260717-120000.sql
```

These scripts are the "how", not the "when". There is no scheduler in this repo
because no specific production host is assumed. Wire `scripts/db_backup.sh` into
whatever your host provides, such as cron, a systemd timer, managed Postgres
backups, or a sidecar container. Choose a schedule that matches your data's
change rate. Daily is a reasonable default for most small apps. Store dumps
somewhere durable off the host, and periodically test a restore.

Equivalent raw commands, if you'd rather not use the scripts:

```bash
docker compose exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup-$(date +%F).sql
docker compose exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB < backup-2026-07-13.sql
```

---

## Graceful shutdown

`backend/app/main.py` registers a FastAPI `lifespan` handler that runs on
shutdown, including `docker stop` and rolling restarts under an orchestrator. It
disposes the SQLAlchemy connection pool and closes the Redis client cleanly.

---

## Production host requirements

This template assumes a Docker-capable host that can run long-lived services.
Use `docker-compose.prod.yml` when this stack should own the public HTTP/HTTPS
entrypoint through Caddy. Use `docker-compose.local-prod.yml` when another
reverse proxy or TLS terminator sits in front of the stack.

At minimum, a production deployment needs:

- A host that can run Docker Compose continuously.
- Persistent storage for Postgres, Caddy certificates, and Bugsink state.
- Network access for SMTP email delivery.
- DNS pointing at the public host before starting `docker-compose.prod.yml`.
- A backup schedule for Postgres dumps or volume snapshots.
- Monitoring and alerting appropriate for the environment.

The backend, frontend nginx, Postgres, Redis, Taskiq worker, Alembic migration
runner, and Bugsink services are all included in the Compose files. The email
pipeline depends on the long-running `taskiq_worker` service connected to Redis;
request-driven serverless backend deployments are intentionally out of scope.

---

## Limitations of this deployment approach

- No infrastructure as code is provided. The steps above are manual host setup
  and Docker Compose operations.
- No automated backups are wired up. See
  [Concerns: database backups](../concerns/README.md#database-backups-are-scripted-but-not-scheduled).
  Error monitoring and alerting are available but opt-in. See
  [Error Monitoring](../error-monitoring/overview.md).
- Capacity planning, host hardening, backups, and alerting remain deployment
  responsibilities outside this template.
