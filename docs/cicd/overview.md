# CI/CD Overview

## Workflow

`.github/workflows/ci.yml` — triggers on every push and pull request targeting `main`. Three independent jobs, all run in parallel (no job depends on another):

### `backend` — Backend (unit + integration)

- Spins up Postgres 15 and Redis 7 as GitHub Actions **service containers** (not Docker Compose — a deliberate, lower-overhead equivalent for CI; Compose remains the source of truth for local development).
- All required settings (`SECRET_KEY`, `GOOGLE_CLIENT_ID`, `APP_NAME`, etc. — `core/settings.py` has no defaults for most of them) are provided as job-level env vars with clearly-fake CI-only values, since there's no checked-in `.env` for CI to read. `APP_NAME` in particular is set to `MysticAuth` here purely because `Settings` requires *some* value and refuses to start without one — it has no bearing on the actual product name. If you've cloned this repo as a template and renamed the app (see [Using This Repository as a Template: renaming the app](../template-usage.md#renaming-the-app)), there's no need to touch this CI value to match — it's a placeholder for test runs, not branding that needs to stay in sync with your `.env`.
- Installs dependencies, then runs `pip-audit -r backend/requirements.txt` (dependency vulnerability scan) before proceeding.
- Runs `alembic upgrade head`, then `pytest tests/backend/unit`, then `pytest tests/backend/integration --cov-append`, then `pytest tests/backend/security --cov-append --cov-fail-under=85`. The `--cov-append` flags accumulate coverage across all three steps, so the 85% gate on the final step checks *cumulative* unit+integration+security coverage (currently ~89%), not any one suite alone — `pytest.ini` deliberately does not bake `--cov-fail-under` into `addopts` itself, since that would also apply to (and false-fail) a developer running a single suite locally. See [Testing Overview](../testing/overview.md).
- Then runs `pytest tests/backend/performance` as a **non-blocking** (`continue-on-error: true`) step — informational only, since its thresholds, while generous regression alarms rather than a strict SLA, can still be noisier on shared GitHub-hosted runners than locally.

### `frontend` — Frontend (typecheck + lint + test + build)

- `npm ci --legacy-peer-deps`, then `npm audit --audit-level=high` (dependency vulnerability scan), then `npm run typecheck`, `npm run lint`, `npm run test:coverage` (not plain `test` — coverage must actually be collected for `vitest.config.ts`'s `coverage.thresholds` to be evaluated at all), `npm run build`, each as a separate step (so the specific failing stage is visible in the Actions UI).

### `docker-build` — Docker image build verification

- Builds `docker/backend.Dockerfile` and `docker/frontend.Dockerfile --target production` to confirm both images still build cleanly.
- **No push to a registry, no deploy step** — this repo has no deploy pipeline; that's an explicit scope boundary (a template repository shouldn't assume a specific cloud/hosting target), not an oversight.

## What's covered

- Backend unit/integration/security suites, against real Postgres/Redis, gated by an 85% cumulative-coverage threshold; performance tests run too, non-blocking.
- Full frontend type-check, lint, test (with coverage thresholds enforced), and production build.
- Both Docker images still build.
- Dependency vulnerability scanning on every push/PR: `pip-audit` (backend) and `npm audit --audit-level=high` (frontend) — lightweight steps added to the existing jobs, not new jobs, so CI time is barely affected. `.github/dependabot.yml` complements this with a weekly scheduled check (`pip` for `/backend`, `npm` for `/frontend`) that opens version-bump PRs between CI runs — CI catches vulnerabilities at push/PR time, Dependabot catches them in between.

## What's not covered (tracked, not silently missing)

See [Concerns](../concerns/README.md) for the full entries:

- No image push to a registry and no deployment stage — deploying is a manual, documented process (see [Deployment Guide](../deployment/guide.md)), not automated.

This is deliberately left as a documented gap rather than added — extending `ci.yml` with a deploy stage is a workflow change with its own blast radius (new required checks, new secrets, a specific hosting target to assume), and unnecessary cloud-specific tooling doesn't belong in a template repository with no assumed production target.

## Local equivalents

Everything CI runs can be run locally:

```bash
# Backend (from repo root, against local or Dockerized Postgres/Redis)
python -m pytest tests/backend/unit tests/backend/integration tests/backend/security -q
python -m pytest tests/backend/performance -q

# Frontend (from frontend/)
npm run typecheck && npm run lint && npm run test:coverage && npm run build

# Docker image builds (from repo root)
docker build -f docker/backend.Dockerfile -t backend:local .
docker build --target production -f docker/frontend.Dockerfile -t frontend:local .
```
