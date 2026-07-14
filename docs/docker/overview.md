# Docker Overview

## Services

| Service | Image / build | Purpose |
|---|---|---|
| `postgres` | `postgres:15` | Primary database |
| `redis` | `redis:7` | Cache, rate limits, lockout counters, refresh-token jti registry, single-use tokens, taskiq broker |
| `backend` | `docker/backend.Dockerfile` | FastAPI app (uvicorn) |
| `frontend` | `docker/frontend.Dockerfile` (`dev` target locally, `production` target in prod) | React SPA — Vite dev server locally, nginx-served static build in prod |
| `taskiq_worker` | `docker/backend.Dockerfile` (same image as `backend`, different `command:`) | Consumes the email-sending task queue — see [Background Workers](../background-workers/taskiq.md) |
| `alembic` | `docker/backend.Dockerfile` (same image, one-shot) | Runs `alembic upgrade head` then exits; `backend`/`taskiq_worker` wait on its success in prod |

`backend`, `taskiq_worker`, and `alembic` all build from the **same** `docker/backend.Dockerfile` image with different `command:` overrides — keeps dependency versions and application code identical across all three roles by construction.

## Dockerfiles

- **`docker/backend.Dockerfile`** — two-stage build: a `builder` stage compiles native dependencies (`gcc`, `libpq-dev`) into an isolated venv; the runtime stage is `python:3.11-slim` with only `libpq5` (runtime client lib, not the dev headers), running as a non-root `app` user. Ships a `HEALTHCHECK` against `/health/ready` as a fallback for when the image runs outside Compose (Compose's own healthcheck, defined per-service, is what actually gates dependent-service startup).
- **`docker/frontend.Dockerfile`** — three stages: `dev` (default target — `node:20-bullseye`, Vite dev server with HMR, port 5173), `builder` (compiles the production bundle), `production` (`nginx:1.27-alpine` serving the static build as a non-root `nginx` user, port 80, `HEALTHCHECK` via `wget`).
- **`docker/nginx.frontend.conf`** — SPA fallback to `index.html`, gzip, security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, CSP). No HSTS at this layer — by design, since TLS terminates in front of this container in a real deployment, not here (see [Security Hardening](../security/hardening.md#security-response-headers)).

## Dev vs. production compose

| | `docker-compose.yml` (dev) | `docker-compose.prod.yml` |
|---|---|---|
| Frontend | Vite dev server, HMR, bind-mounted source | nginx serving the baked-in static build |
| Backend/worker | `--reload`, bind-mounted `./backend:/app` | No reload, code baked into the image |
| Restart policy | `restart: always` (postgres/redis only; backend/frontend/worker have none) | `unless-stopped` on every long-running service |
| Ports exposed | 5432, 6379, 8000, 5173 all published to host | Only 8000 (backend) and 80 (frontend) published |
| `backend`/`taskiq_worker` startup gate | `postgres`/`redis` healthy | `postgres`/`redis` healthy **and** `alembic: service_completed_successfully` |

Both compose files assume a reverse proxy / TLS terminator sits in front of the stack in a real deployment — neither attempts to provision TLS itself. See [Deployment Guide](../deployment/guide.md).

## Healthchecks

| Service | Check | Notes |
|---|---|---|
| `postgres` | `pg_isready` | |
| `redis` | `redis-cli ping` | |
| `backend` | `GET /health/ready` via a Python one-liner (no curl in the slim image) | Confirms DB + Redis connectivity, not just process liveness |
| `frontend` (prod) | `wget` against `/` | |
| `frontend` (dev) | none | Acceptable for local dev — Vite's own dev server failure is immediately visible in the terminal |
| `taskiq_worker` | greps `/proc/*/cmdline` for `taskiq` | Overrides the inherited HTTP healthcheck from `backend.Dockerfile`, since the worker serves no HTTP and would otherwise always report unhealthy |
| `alembic` | none | One-shot; `service_completed_successfully` is the signal other services wait on, not a healthcheck |

## Validation results

Ran `docker compose up --build` (dev compose) from the repo root against a fresh `postgres_data` volume and verified the stack end-to-end:

- All five services (`postgres`, `redis`, `backend`, `taskiq_worker`, `frontend`) reached a running state; `postgres`, `redis`, `backend`, `taskiq_worker` all reported `healthy` on their respective healthchecks (`frontend` dev has none, by design — see above).
- `alembic` ran the full migration chain successfully against the fresh database.
- `GET /health/ready` returned `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`.
- Frontend dev server responded `200` on `http://localhost:5173/`.
- A real `POST /auth/signup` round trip succeeded end-to-end: user row created, verification email task enqueued, and `taskiq_worker` picked it up and sent the email via Gmail SMTP (confirmed in its logs). The duplicate-signup retry correctly returned the identical generic response (enumeration resistance working as documented).
- **One real issue found**: `taskiq_worker` crash-looped for the first ~30-60 seconds against the fresh Redis Stream before self-stabilizing (`NOGROUP` error, auto-restarted by its own `--reload` supervisor each time) — no task was lost, but email delivery in that window is delayed rather than immediate. See [Concerns](../concerns/README.md#taskiq_worker-crash-loops-for-30-60s-on-a-fresh-redis-stream-before-stabilizing) for the full writeup; not fixed in this pass (self-healing, no data loss, low priority).

Local port 5432 was found to have a native Postgres install competing with Docker's own mapping on the same host — exactly the scenario [PBAC Troubleshooting](../authorization/troubleshooting.md#cannot-connect-to-postgres-from-the-host-but-the-container-is-healthy) already documents. Backend test suites were run from inside the Docker network (`docker exec -w /repo backend python -m pytest tests/backend/`) to avoid it, per that doc's own recommended workaround — see [Testing Overview](../testing/overview.md).
