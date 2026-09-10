# Environment and Runtime Configuration
---

*New to a term here? See the [Infrastructure Glossary](../glossary/infrastructure.md).*

Deployment modes use separate environment files so dev, local-prod tunnel variants, and prod can hold real values at the same time without overwriting one another.

---

## 1. Choosing the right env template
---

| Mode | Copy this file | To this file | Use with | Best for |
|---|---|---|---|---|
| Dev | `env/mystic_auth/.env.example` | `env/mystic_auth/.env` | `docker/mystic_auth/compose/docker-compose.dev.yml` | Local development with hot reload |
| Local-prod Cloudflare | `env/mystic_auth/.env.local-prod-cloudflare.example` | `env/mystic_auth/.env.local-prod-cloudflare` | `docker/mystic_auth/compose/docker-compose.local-prod-cloudflare.yml` | Your machine through Cloudflare Tunnel |
| Local-prod ngrok | `env/mystic_auth/.env.local-prod-ngrok.example` | `env/mystic_auth/.env.local-prod-ngrok` | `docker/mystic_auth/compose/docker-compose.local-prod-ngrok.yml` | Your machine through ngrok |
| Local-prod Tailscale | `env/mystic_auth/.env.local-prod-tailscale.example` | `env/mystic_auth/.env.local-prod-tailscale` | `docker/mystic_auth/compose/docker-compose.local-prod-tailscale.yml` | Your machine through Tailscale Funnel |
| Prod | `env/mystic_auth/.env.prod.example` | `env/mystic_auth/.env.prod` | `docker/mystic_auth/compose/docker-compose.prod.yml` | Public server with Caddy TLS |

---

## 2. Copy and run examples
---

```bash
# Dev
cp env/mystic_auth/.env.example env/mystic_auth/.env
docker compose -f docker/mystic_auth/compose/docker-compose.dev.yml up

# Local-prod, ngrok example
cp env/mystic_auth/.env.local-prod-ngrok.example env/mystic_auth/.env.local-prod-ngrok
docker compose -f docker/mystic_auth/compose/docker-compose.local-prod-ngrok.yml --env-file env/mystic_auth/.env.local-prod-ngrok up -d --build

# Prod
cp env/mystic_auth/.env.prod.example env/mystic_auth/.env.prod
docker compose -f docker/mystic_auth/compose/docker-compose.prod.yml --env-file env/mystic_auth/.env.prod up -d --build
```

---

## 3. Compose env-file rule
---

The `--env-file` flag matters for local-prod and prod. Compose only auto-loads a file literally named `env/mystic_auth/.env` for `${VAR}` substitution in Compose YAML. Each service's `env_file:` entry points at the correct dedicated file, but frontend build args and other Compose-level substitutions still need `--env-file`.

Use the helper scripts when possible because they always pass the matching env file:

1. `scripts/mystic_auth/docker/dev/dev-up.*`
2. `scripts/mystic_auth/docker/local-prod-cloudflare/local-prod-cloudflare-up.*`
3. `scripts/mystic_auth/docker/local-prod-ngrok/local-prod-ngrok-up.*`
4. `scripts/mystic_auth/docker/local-prod-tailscale/local-prod-tailscale-up.*`
5. `scripts/mystic_auth/docker/prod/prod-up.*`

---

## 4. Runtime vs build-time settings
---

| Setting group | Read time | Examples |
|---|---|---|
| Backend runtime settings | Container or process startup | `DATABASE_URL`, `APP_DATABASE_URL`, `SECRET_KEY`, `GOOGLE_REDIRECT_URI`, SMTP settings, rate-limit settings, `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`, `SENTRY_DSN` |
| Compose-only scaling setting | Compose command evaluation, not read by the app itself | `UVICORN_WORKERS` |
| Frontend build settings | Image build time | `VITE_API_BASE_URL`, `VITE_APP_NAME`, `VITE_BRAND_COLOR`, `VITE_SUPPORT_EMAIL`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT` |
| Compose interpolation settings | Compose command evaluation | Tunnel tokens, public domains, frontend build args, image names, exposed ports |

Production-shaped frontend values are baked into the static bundle by `docker/mystic_auth/dockerfiles/frontend.Dockerfile`. After changing any `VITE_*` input, rebuild the frontend image with `--build`.

---

## 5. Required production review
---

`scripts/mystic_auth/env-tools/check-env/check-env.sh <file>` (`.ps1`/`.cmd`) automates the part
of this review a script can check: it fails if `ENVIRONMENT=production` but
a secret still equals the shipped placeholder, and warns on remaining
`<your_...>` placeholders or a host port already bound by something else.
Run it before `up`, then review the rest of this list by hand:

Review these settings before sharing a production-shaped deployment:

1. Set `ENVIRONMENT=production` to disable `/docs`, `/redoc`, and `/openapi.json`.
2. Generate real values for `SECRET_KEY`, `GOOGLE_CLIENT_SECRET`, `GMAIL_APP_PASSWORD`, `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, and `BUGSINK_SECRET_KEY`.
3. Configure at least one user verification path: SMTP email for password signup or Google OAuth2 login.
4. Set `FRONTEND_BASE_URL` and `BACKEND_BASE_URL` to the public origin for the selected deployment.
5. Set `GOOGLE_REDIRECT_URI` to the exact registered callback URL.
6. Set `JWT_ISSUER` and `JWT_AUDIENCE`, normally to the backend origin for this deployment.
7. Set `TRUSTED_PROXY_IPS` to the reverse-proxy hop that should be trusted for `X-Forwarded-For`. For the bundled prod/local-prod-* Compose files this is derived automatically from `FRONTEND_STATIC_IP`/the tunnel's `*_STATIC_IP` var - see [Routing: Trusted proxy IPs](routing.md#2-trusted-proxy-ips) - so review those vars instead of `TRUSTED_PROXY_IPS` directly.
8. Leave `VITE_API_BASE_URL` empty for the bundled same-origin nginx proxy, or set it only when the frontend is deployed separately.
9. Set `DEFAULT_APP_POLICIES` only when downstream app policies should be assigned to every verified user.
10. Configure `SENTRY_DSN` and `VITE_SENTRY_DSN` only when error monitoring is enabled.
11. Configure `GEOIP_DB_PATH` and `GEOIPUPDATE_*` only when enabling the `geoip` Compose profile.
12. Keep `USER_EXPORT_MAX_ROWS` sized for the largest safe CSV export your deployment can handle.
13. `UVICORN_WORKERS` auto-sizes on boot and needs no default value; only set it to override the auto-picked count, and size `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` to match if you do - see [§7 below](#7-scaling-and-load-capacity).

---

## 6. Running the backend without Docker

---

Useful for iterating on the backend with a debugger attached, or a faster
reload loop than the Dockerized `dev` target gives you. Postgres and Redis
still run in Docker either way; only the FastAPI process itself moves to
the host.

1. Bring up just the data services: `docker compose -f docker/mystic_auth/compose/docker-compose.dev.yml -f docker/app/compose/docker-compose.dev.yml --env-file env/mystic_auth/.env --env-file env/app/.env up -d postgres redis`.
2. In `env/mystic_auth/.env`, swap `DATABASE_URL` and `REDIS_URL` for their commented-out `localhost` alternatives already shipped right below each one (`postgres:5432` -> `localhost:5433`, `redis:6379` -> `localhost:6380`, the host ports the dev Compose file maps to avoid colliding with a developer's own local Postgres/Redis).
3. From the repo root, create a virtualenv and install both dependency files: `pip install -r backend/requirements.txt -r backend/requirements-dev.txt`.
4. Run migrations once: `cd backend && alembic upgrade head`.
5. Start the app: `uvicorn app.main:app --reload` from `backend/`. `--reload` gives a faster edit loop than rebuilding the Docker image.

`Settings` (`backend/mystic_auth/core/settings.py`) reads `env/mystic_auth/.env` and `env/app/.env` directly when a variable isn't already in the process environment, so no manual `export` is needed as long as you're running from a checkout with those files in place - only real-value overrides (an IDE launch config, a shell you've already exported into) take priority over the files.

Running the whole suite this way? `tests/backend/conftest.py` does the same `postgres`/`redis` -> `localhost` derivation automatically from `env/mystic_auth/.env` when `DATABASE_URL`/`REDIS_URL` aren't already set, so `pytest` from the repo root needs no extra setup once step 1 above is running. See [Testing Overview](../testing/overview.md).

---

## 7. Scaling and load capacity
---

`UVICORN_WORKERS` (prod-shaped deployments only; `dev` uses `--reload`, which
forces a single process) sets how many uvicorn worker processes the
`backend` service runs, each with its own DB connection pool sized by
`DB_POOL_SIZE`/`DB_MAX_OVERFLOW`. Keep
`UVICORN_WORKERS * (DB_POOL_SIZE + DB_MAX_OVERFLOW)` under Postgres's own
`max_connections` (100 by default), leaving headroom for
`alembic`/`procrastinate_worker`/`db_backup`'s own connections.

**Left unset (the shipped default), it auto-sizes on every boot** to
`min(host CPU cores, 4)` - every prod-shaped Compose file (`prod`,
`local-prod-cloudflare`, `local-prod-ngrok`, `local-prod-tailscale`) runs
this same `nproc`-based calculation in its `backend` service's startup
command and logs which value it picked (`docker logs <backend container>`
shows `[backend] UVICORN_WORKERS not set - auto-sizing to N worker(s)`).
The cap at 4 is deliberate, not a host-size guess: with the default
`DB_POOL_SIZE=5`/`DB_MAX_OVERFLOW=10`, 4 workers tops out at 60 of
Postgres's default 100 `max_connections`, leaving headroom regardless of
how many cores the host actually has. Set `UVICORN_WORKERS` explicitly to
override in either direction - fewer on a host you're sharing with other
services, more on a box with real spare capacity (raise
`DB_POOL_SIZE`/`DB_MAX_OVERFLOW` to match if you do, per the formula
above).

Measured against a real local-prod-ngrok stack with `wrk` (4 threads, 200
persistent connections, 15s, `GET /health/ready`). At the time of this
measurement, this repo's own `scripts/mystic_auth/load-test/load_test.py`
was a single-process Python client that pegged one CPU core and became the
actual bottleneck before the server did, masking the difference workers
make, so `wrk` was used instead for this specific comparison. That script
has since been fixed to split work across multiple OS processes (see its
own `--workers` flag, default one per CPU core) and no longer has this
problem - either tool now gives a trustworthy number:

| Config | Throughput | Timeouts (of ~5,000 req) | Notes |
|---|---|---|---|
| `UVICORN_WORKERS=1` | 299 req/s | 175 | Single event loop; Argon2 and JSON work all serialize behind it |
| `UVICORN_WORKERS=4` (shipped default, this host has 12 cores) | 375 req/s | 31 | ~25% higher throughput, ~82% fewer timeouts, same host |

The gain here is real but modest compared to a dedicated benchmarking
host, because Postgres, Redis, and every other stack service were
competing for the same machine's cores during the test - representative
of a small self-hosted box, not a provisioned multi-machine deployment.
Re-run the comparison yourself against your own target hardware before
trusting either number, using [`wrk`](https://github.com/wg/wrk) (packaged
for most distros - `apt install wrk` on Debian/Ubuntu, `brew install wrk`
on macOS - so you're running a package-manager-verified build, not an
unaudited third-party Docker image):
```bash
wrk -t4 -c200 -d15s http://localhost:<BACKEND_HOST_PORT>/health/ready
```

`POST /auth/login` is the outlier: capped around 15-20 req/s regardless of
worker count, since Argon2 password verification is deliberately
CPU-expensive per request (see `backend/mystic_auth/auth/password_logic/password_service.py`) -
more workers help concurrency, not this per-request cost.

---

## 8. Related docs
---

1. [Configuration Reference](../environment/README.md)
2. [Deployment Guide](guide.md)
3. [Local-Prod Deployment](local-prod/README.md)
4. [Error Monitoring](../error-monitoring/overview.md)
5. [Session Geolocation](../geolocation/overview.md)

---
