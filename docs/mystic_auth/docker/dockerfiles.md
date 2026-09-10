# Docker: Dockerfiles

---

*New to a term here? See the [Infrastructure Glossary](../glossary/infrastructure.md).*

## Backend and frontend images

- **`docker/mystic_auth/dockerfiles/backend.Dockerfile`**: three named stages, both `builder` and `runtime` on `python:3.14-alpine` (not Debian: Trivy found `python:3.14-alpine` at 0 High/Critical on this app's built image vs. `python:3.14-slim` at 50+, all unpatched Debian OS packages unrelated to app code).
  - `builder` compiles native extensions (`gcc`, `musl-dev`, `postgresql-dev`, `libffi-dev`, since Alpine has no prebuilt manylinux wheels for these against musl libc the way Debian does) into an isolated venv.
  - `runtime` (`apk upgrade`d to pull in any Alpine security patches released since the base image tag was built, running as a non-root `app` user) copies that venv plus the app source; no system `libpq` package is needed, since `psycopg[binary]` bundles its own and `asyncpg` speaks the wire protocol itself. `pip`/`setuptools` are then stripped from both the venv and the base image's system site-packages, since the running app never imports or invokes them and their vendored bundled dependencies are pure CVE/attack-surface liability with no runtime upside. This is the image `backend`, `procrastinate_worker`, and `alembic` all deploy from, and the default target when none is passed.
  - `test` builds on top of `runtime` and, as `root`, restores `pip` (via `ensurepip`, since `runtime` just stripped it) before installing `backend/requirements-dev.txt` (pytest and friends) with it, so `docker-full-suite` (CI) can run the full backend suite against the actual pinned dependency set inside the real image, without that tooling ever shipping in the `runtime` image everyone else deploys.
  - Selected via the `backend` service's `target: ${BACKEND_BUILD_TARGET:-runtime}` in `docker/mystic_auth/compose/docker-compose.dev.yml`; CI builds `--target runtime` for the real image and sets `BACKEND_BUILD_TARGET=test` only for the `docker-full-suite` job.
  - Ships a `HEALTHCHECK` against `/health/ready` as a fallback for when the image runs outside Compose (Compose's own healthcheck, defined per-service, is what actually gates dependent-service startup).
  - Alpine's `adduser -S` assigns a different UID than the old Debian image did, so an existing `backend_logs` volume from before this migration needs `docker volume rm backend_logs` (or a chown) once; a fresh volume just inherits the right owner.
- **`docker/mystic_auth/dockerfiles/frontend.Dockerfile`**: three stages:
  - `dev` (default target: `node:22.23.2-bookworm`, Vite dev server with HMR, port 5173, runs as root since the container needs to `npm install` against the bind-mounted `frontend/` and root avoids host/container UID mismatches on the bind mount: the `production` stage below is the one that runs as a non-root user).
  - `builder` (compiles the production bundle; takes `VITE_API_BASE_URL`/`VITE_APP_NAME`/`VITE_SENTRY_DSN`/`VITE_SENTRY_ENVIRONMENT` as build args, since this stage has no bind-mounted `frontend/.env` to read them from the way `dev` does: wired from that mode's `env/` file via each production-style Compose file's `build.args`, see [Deployment Guide](../deployment/environment.md#5-required-production-review)).
  - `production` (`nginx:stable-alpine`, `apk upgrade`d for the same reason as the backend's above, serving the static build as a non-root `nginx` user, port 80, `HEALTHCHECK` via `wget`).

Both `runtime` and `production` re-run their package-manager upgrade on every build rather than pinning to a snapshot, so a rebuild always picks up whatever Alpine security patches have been published since the base image tag was last republished, rather than waiting on the next `python`/`nginx` tag release.
- **`docker/mystic_auth/nginx.frontend.conf`**: SPA fallback to `index.html`, gzip, security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, CSP, and `Strict-Transport-Security`). Sends HSTS itself, unlike the backend's own copy of this header set which gates it on `ENVIRONMENT == "production"`: this stage only ever ships in a production-shaped deployment, so it can send it unconditionally, and needs to since the local-prod-ngrok/cloudflare/tailscale tunnel modes have no other layer in front of it that would (see [Security Hardening: HTTP Layer](../security/hardening-http.md#security-response-headers)).
- **`.dockerignore`** (repo root: the build context for both Dockerfiles above is `.`, not `backend/`/`frontend/` individually, so its patterns are written relative to the repo root): excludes `backend/logs/` (real local request logs, previously leaking into the backend image: a real bug, not a hypothetical one, see [Security Decisions](../security/decisions-infra.md#dockerignore-previously-let-local-files-leak-into-built-images)) and `**/`-recursive patterns for `__pycache__/`/`*.pyc`/`.pytest_cache/` (bare patterns without the `**/` prefix looked like they should already match at any depth but empirically didn't).

---

## Why `frontend` sets `pull_policy: build`

- `frontend` is the only service in any of the five compose files with both `image:` (`mystic-auth-dev-frontend` / `mystic-auth-local-prod-cloudflare-frontend` / `mystic-auth-local-prod-ngrok-frontend` / `mystic-auth-local-prod-tailscale-frontend` / `mystic-auth-prod-frontend`, one per file so building one never overwrites another's image) and `build:` set.
- Every other service either only has `build:` (nothing to pull) or only has `image:` (postgres, redis, bugsink, genuinely pulled from a registry).
- Without `pull_policy: build`, Compose attempts a pull of `image:` first on every run, which always fails (`pull access denied for mystic-auth-dev-frontend, repository does not exist`) since these tags are never published, before falling back to building anyway. Harmless but noisy on every startup.
- `pull_policy: build` skips straight to building.

---

See [Docker Overview](overview.md) for the full service list, or
[Compose Modes](compose-modes.md) for dev vs. production differences.

---
