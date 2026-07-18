# Testing Overview

## Backend — pytest

Config: `pytest.ini` (repo root) — `testpaths = tests/backend`, `addopts = -v --cov=backend/app --cov-report=html`. Coverage is measured and an HTML report generated (`htmlcov/`) on every invocation. **`--cov-fail-under` is deliberately not set in `pytest.ini`** — it would apply to every invocation, including partial local runs (`pytest tests/backend/unit` alone covers only a slice of `backend/app` and would false-fail well under any sensible whole-project threshold). CI enforces an 85% cumulative-coverage gate once instead — see below.

| Suite | Path | Covers |
|---|---|---|
| Unit | `tests/backend/unit/` (~45 files) | Auth (login/signup/logout/refresh/password reset/JWT/OAuth2/account verification), authorization (service, cache, dependency, evaluator, condition validator/schema consistency, policy routes/history/repository caching), rate limiter, login lockout, correlation ID middleware, security headers, route helpers, logging config, email tasks, user email CRUD |
| Integration | `tests/backend/integration/` (8 files) | Audit log, authorization routes, auth API, health, OAuth, security audit log, security headers, user routes — real DB/Redis, real HTTP client |
| Security | `tests/backend/security/` (5 files) | Batch authorization abuse, context spoofing, invalid condition payload, policy tampering, privilege escalation |
| Performance | `tests/backend/performance/` (1 file) | Authorization performance |

**Running:**

```bash
# From repo root, against local Postgres/Redis (see .env)
python -m pytest tests/backend/unit -q
python -m pytest tests/backend/integration -q
python -m pytest tests/backend/security -q
python -m pytest tests/backend/performance -q

# Inside the Docker network (avoids host/container Postgres port conflicts —
# see PBAC Troubleshooting)
docker compose exec -w /repo backend python -m pytest tests/backend/
```

CI (`.github/workflows/ci.yml`) runs unit, integration, and security suites against GitHub Actions service containers (Postgres 15, Redis 7) on every push/PR to `main`. The integration and security steps pass `--cov-append` so coverage accumulates across all three suites, and the security step (running last) adds `--cov-fail-under=85` — a regression alarm against *cumulative* unit+integration+security coverage (currently ~89%), not any single suite in isolation. Performance tests also run in CI, as a **non-blocking** (`continue-on-error: true`) informational step — their thresholds are deliberately generous regression alarms rather than a strict SLA, but timing can still be noisier on shared runners than locally, hence non-blocking rather than a hard gate.

## Frontend — Vitest

Config: `frontend/vitest.config.ts` — tests physically live in `tests/frontend/` (outside `frontend/src/`) via a custom Vite resolver plugin, not co-located with source. Coverage provider `v8`, reporters `text`/`json`/`html` — same as the backend. `coverage.thresholds` (statements 85 / branches 78 / functions 79 / lines 86 — a few points below the current whole-project average of ~89/82/84/90%) are enforced, but **only when coverage is actually collected** (`vitest run --coverage`, i.e. the `test:coverage` script) — plain `vitest run` (`npm run test`) never evaluates them on its own, which is why CI runs `test:coverage` specifically (see below).

| Suite | Path | Covers |
|---|---|---|
| Unit | `tests/frontend/unit/` (~30 files) | API clients (`auth`/`users`/`policies`/`audit` endpoints, `apiError`, the refresh interceptor), `useAuthSession`, `Authorized`/`ProtectedRoute`/`Sidebar`/`Navbar`/`AppLayout` components, `useAuthorization`/`useCan`/`usePasswordPolicy`/`useUnsavedChangesWarning` hooks, `authorizationService`, `themeStore`, `components/ui/*` (`DataTable`, `ConfirmDialog`, `FormAlert`, `PasswordRulesChecklist`, `LoadingState`, `Toaster`) |
| Integration | `tests/frontend/integration/` (10 files) | App routing, audit log page, auth flow, dashboard, login page, password policy consistency, PBAC authorization flow, policies page (list, permission gating, create/edit/delete, conditions-JSON validation, unsaved-changes discard prompt), users page (list, permission gating, delete/purge/reactivate/role-change, assign/revoke via the Policies dialog), profile page (including the self-service current-password requirement) |

**Running:**

```bash
cd frontend
npm run typecheck   # three tsc --noEmit passes: app / node / test tsconfigs
npm run lint        # eslint over frontend/ and tests/frontend/
npm run test         # vitest run (no coverage collection/thresholds)
npm run test:coverage  # vitest run --coverage (thresholds enforced)
```

CI runs `typecheck`, `lint`, `test:coverage` (not plain `test` — see above), and `build` on every push/PR to `main`.

### `.not` chaining and jest-dom/Vitest type augmentation

`frontend/tsconfig.test.json` goes to some length (see its own inline comments) to make jest-dom's Vitest matcher augmentation (`toBeInTheDocument()`, etc.) type-check via a shared module-identity `paths` mapping. That augmentation does not currently extend to chained `.not.toBe()`/`.not.toBeNull()` — `tsc` reports `Property 'not' does not exist` for those specific chains even though the same assertions type-check fine unchained. No test in this repo uses `.not.` chaining as a result; prefer a positive assertion instead (`toBeTruthy()`, an equality check phrased the other way round, etc.) — see `tests/frontend/unit/components/layout/AppLayout.test.tsx` and `tests/frontend/unit/components/ui/LoadingState.test.tsx` for examples.

## Troubleshooting

- **A test hangs / can't connect to Postgres from the host**: see [PBAC Troubleshooting: database connection issues](../authorization/troubleshooting.md#database-connection-issues) — a native Postgres install or another project's container on the host can still intercept whatever port is configured, even though this template maps Postgres to the non-default host port `5433` specifically to avoid the common case.
- **Frontend test can't resolve a `tests/frontend/...` import**: confirm `frontend/vitest.config.ts`'s custom resolver plugin is active — it's what makes the split `frontend/src` / `tests/frontend` layout work; running vitest from anywhere other than `frontend/` bypasses it.
