# CI/CD Overview

## Workflow

`.github/workflows/ci.yml` — triggers on every push and pull request targeting `main`. Three independent jobs, all run in parallel (no job depends on another):

### `backend` — Backend (unit + integration)

- Spins up Postgres 15 and Redis 7 as GitHub Actions **service containers** (not Docker Compose — a deliberate, lower-overhead equivalent for CI; Compose remains the source of truth for local development).
- All required settings (`SECRET_KEY`, `GOOGLE_CLIENT_ID`, etc. — `core/settings.py` has no defaults for most of them) are provided as job-level env vars with clearly-fake CI-only values, since there's no checked-in `.env` for CI to read.
- Runs `alembic upgrade head`, then three separate `pytest` invocations: `tests/backend/unit`, `tests/backend/integration`, `tests/backend/security`.
- **Performance tests (`tests/backend/performance/`) are not run in CI.**

### `frontend` — Frontend (typecheck + lint + test + build)

- `npm ci --legacy-peer-deps`, then `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, each as a separate step (so the specific failing stage is visible in the Actions UI).

### `docker-build` — Docker image build verification

- Builds `docker/backend.Dockerfile` and `docker/frontend.Dockerfile --target production` to confirm both images still build cleanly.
- **No push to a registry, no deploy step** — this repo has no deploy pipeline; that's an explicit scope boundary (CLAUDE.md: "no unnecessary cloud-specific tooling"), not an oversight.

## What's covered

- Backend unit/integration/security suites, against real Postgres/Redis.
- Full frontend type-check, lint, test, and production build.
- Both Docker images still build.

## What's not covered (tracked, not silently missing)

See [Concerns](../concerns/README.md) for the full entries:

- No coverage threshold gate (backend or frontend) — a coverage regression doesn't fail CI.
- No performance-test job.
- No dependency/security scanning (`pip-audit`, `npm audit`, Trivy, or similar) on either the Python or Node dependency tree.
- No image push to a registry and no deployment stage — deploying is a manual, documented process (see [Deployment Guide](../deployment/guide.md)), not automated.

These are deliberately left as documented gaps rather than added in this pass — extending `ci.yml` with new jobs is a workflow change with its own blast radius (new required checks, new secrets if scanning needs them), and CLAUDE.md's own scope note discourages unnecessary cloud-specific tooling for what is a template repository.

## Local equivalents

Everything CI runs can be run locally:

```bash
# Backend (from repo root, against local or Dockerized Postgres/Redis)
python -m pytest tests/backend/unit tests/backend/integration tests/backend/security -q

# Frontend (from frontend/)
npm run typecheck && npm run lint && npm run test && npm run build

# Docker image builds (from repo root)
docker build -f docker/backend.Dockerfile -t backend:local .
docker build --target production -f docker/frontend.Dockerfile -t frontend:local .
```
