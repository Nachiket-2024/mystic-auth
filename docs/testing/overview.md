# Testing Overview

## Backend — pytest

Config: `pytest.ini` (repo root) — `testpaths = tests/backend`, `addopts = -v --cov=backend/app --cov-report=html`. Coverage is measured and an HTML report generated (`htmlcov/`), but **no minimum coverage threshold is enforced** (`--cov-fail-under` is not set) — a coverage drop does not fail the build. See [Concerns](../concerns/README.md).

| Suite | Path | Covers |
|---|---|---|
| Unit | `tests/backend/unit/` (~35 files) | Auth (login/signup/logout/refresh/password reset/JWT/OAuth2/account verification), authorization (service, cache, dependency, evaluator, condition validator/schema consistency, policy routes/history/repository caching), rate limiter, login lockout, correlation ID middleware, security headers, route helpers |
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
docker exec -w /repo backend python -m pytest tests/backend/
```

CI (`.github/workflows/ci.yml`) runs unit, integration, and security suites against GitHub Actions service containers (Postgres 15, Redis 7) on every push/PR to `main`. **Performance tests are not run in CI** — they're excluded deliberately, presumably to avoid flaky timing assertions on shared CI runners; run them locally when touching the authorization hot path.

## Frontend — Vitest

Config: `frontend/vitest.config.ts` — tests physically live in `tests/frontend/` (outside `frontend/src/`) via a custom Vite resolver plugin, not co-located with source. Coverage provider `v8`, reporters `text`/`json`/`html` — same as the backend, **no coverage threshold enforced**.

| Suite | Path | Covers |
|---|---|---|
| Unit | `tests/frontend/unit/` (~15 files) | API clients (`auth` endpoints, `apiError`, the refresh interceptor), `useAuthSession`, `Authorized`/`ProtectedRoute`/`Sidebar` components, `useAuthorization`/`useCan` hooks, `authorizationService` |
| Integration | `tests/frontend/integration/` (7 files) | Audit log page, auth flow, dashboard, login page, password policy consistency, PBAC authorization flow, policies page, users page |

**Running:**

```bash
cd frontend
npm run typecheck   # three tsc --noEmit passes: app / node / test tsconfigs
npm run lint        # eslint over frontend/ and tests/frontend/
npm run test         # vitest run
npm run test:coverage
```

CI runs `typecheck`, `lint`, `test`, and `build` on every push/PR to `main`.

## Known coverage gaps (not filled by this pass)

Deliberately left as documented gaps rather than closed — see [Concerns](../concerns/README.md) for the tracked entry:

- `frontend/src/theme/` / `themeStore` — no dedicated test
- Most of `components/ui/*` (`DataTable`, `ConfirmDialog`, `FormAlert`, `PasswordRulesChecklist`, `toaster`, `LoadingState`)
- `components/layout/Navbar.tsx`, `AppLayout.tsx`
- `hooks/usePasswordPolicy` in isolation
- `api/users_api.ts`, `api/policies_api.ts`, `api/audit_api.ts` — only `auth_api` has per-endpoint unit tests today
- `backend/app/taskiq_tasks/email_tasks.py` — no dedicated test for the task itself (only its callers, with `.kiq` mocked)

## Targeted additions made in this pass

- `tests/frontend/integration/profile_page.test.tsx` — the `profile/` self-service flow (own-profile display, password-strength validation, `PUT /users/me` success/failure).
- `tests/frontend/integration/app_routing.test.tsx` — an `App.tsx` routing smoke test (public route, unauthenticated redirect, authenticated protected route, permission-denied redirect to `/not-authorized`, 404 fallback).
- `tests/frontend/unit/hooks/useUnsavedChangesWarning.test.tsx` — the hook `ProfilePage` uses to guard against losing unsaved edits.

`components/IfCan.tsx` turned out to already be covered (it's a thin alias of `Authorized`, exercised directly in `tests/frontend/unit/components/Authorized.test.tsx`) — no new test needed there; the budget went to `useUnsavedChangesWarning` instead, a genuine gap directly exercised by the new profile test. These were the highest-value gaps identified during this documentation/readiness pass, per the agreed scope (targeted, not comprehensive).

## Troubleshooting

- **A test hangs / can't connect to Postgres from the host**: see [PBAC Troubleshooting: database connection issues](../authorization/troubleshooting.md#database-connection-issues) — a native Postgres install on the host can silently intercept port 5432 ahead of Docker's.
- **Frontend test can't resolve a `tests/frontend/...` import**: confirm `frontend/vitest.config.ts`'s custom resolver plugin is active — it's what makes the split `frontend/src` / `tests/frontend` layout work; running vitest from anywhere other than `frontend/` bypasses it.
