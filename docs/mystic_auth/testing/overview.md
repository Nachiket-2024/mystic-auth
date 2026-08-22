# Testing Overview

---

## Backend: pytest

Config lives in `pytest.ini` at the repo root. It sets
`testpaths = tests/backend` and collects coverage for `backend/app` and
`backend/mystic_auth`. An HTML report is generated in `htmlcov/` on every run.
`--cov-fail-under` is not set in `pytest.ini` because it would also apply to
partial local runs. CI enforces the 85% cumulative coverage gate after unit,
integration, and security tests append to the same coverage data.

| Suite | Path | Covers |
|---|---|---|
| App wrapper | `tests/backend/app/` (1 file) | The thin `backend/app/` wrapper itself: the global exception handler wired up in `app/main.py` |
| Unit | `tests/backend/mystic_auth/unit/` (68 files, feature subfolders mirror `backend/mystic_auth/`) | Auth flows, authorization service/evaluator/cache, condition validation, policy routes/history/repository caching, rate limiting, lockout, middleware, security headers, route helpers, logging config, email tasks, user CRUD, ORM/schema coverage, database and Redis singletons, error monitoring, session events, account deletion/purge, and `Settings` behavior |
| Integration | `tests/backend/mystic_auth/integration/` (20 files plus shared account helpers) | Audit log, policy CRUD, policy assignment, authorization checks, auth flows, health, manage sessions, OAuth, security headers, rate limit dashboard, session geolocation, user export, user self-service, user list/update, and account lifecycle against real DB/Redis and a real HTTP client |
| Security | `tests/backend/mystic_auth/security/` (6 files) | Batch authorization abuse, context spoofing, invalid condition payload, policy tampering, privilege escalation, least-privilege DB role (opt-in, skipped unless `APP_DATABASE_URL` is set) |
| Performance | `tests/backend/mystic_auth/performance/` (1 file) | Authorization performance |

**Running:**

```bash
# From repo root, against local Postgres/Redis (see .env)
python -m pytest tests/backend/app -q
python -m pytest tests/backend/mystic_auth/unit -q
python -m pytest tests/backend/mystic_auth/integration -q
python -m pytest tests/backend/mystic_auth/security -q
python -m pytest tests/backend/mystic_auth/performance -q

# Inside the Docker network. This avoids host/container Postgres port conflicts.
# scripts/docker/backend-exec.sh (or .ps1/.cmd) wraps the --user root and
# MSYS_NO_PATHCONV workarounds this needs. See
# docs/mystic_auth/docker/overview.md#running-a-one-off-command-inside-a-container.
scripts/docker/backend-exec.sh python -m pytest tests/backend/
```

CI (`.github/workflows/ci.yml`) runs app-wrapper, unit, integration, and
security suites against GitHub Actions service containers (Postgres 15, Redis 7)
on every push and pull request to `main`. App-wrapper and unit tests create the
first coverage base. Integration and security tests pass `--cov-append`, so the
security step can enforce the cumulative `--cov-fail-under=85` gate. Performance
tests also run as non-blocking informational checks because timing is noisy on
shared runners.

---

## Frontend: Vitest

Config lives in `frontend/vitest.config.ts`. Tests live in `tests/frontend/`
outside `frontend/src/`, wired through a custom Vite resolver plugin. Coverage
uses the `v8` provider with `text`, `json`, and `html` reporters. Thresholds are
enforced only by `vitest run --coverage`, so CI runs `test:coverage`.

| Suite | Path | Covers |
|---|---|---|
| App wrapper | `tests/frontend/app/` (1 file) | Routing declared in `frontend/src/app/App.tsx` |
| Unit | `tests/frontend/mystic_auth/unit/` (51 files) | API clients, refresh interceptor, auth/session hooks, SSE invalidation, authorization components and hooks, password rules, user-agent parsing, unsaved-change handling, theme/language stores, command palette, route-loading UX, shared UI components, error boundary reporting, optional error monitoring, translation key parity across languages, and mobile-overflow regressions |
| Integration | `tests/frontend/mystic_auth/integration/` (13 files) | Audit log page, auth flow, dashboard, login, Manage Sessions, password policy consistency, PBAC authorization flow, policies page, rate limits page, users page, and account settings |

**Running:**

```bash
npm run typecheck --prefix frontend   # app, node, and test tsconfigs
npm run lint --prefix frontend        # eslint over frontend/ and tests/frontend/
npm run test --prefix frontend         # vitest run (no coverage collection/thresholds)
npm run test:coverage --prefix frontend  # vitest run --coverage (thresholds enforced)
```

CI runs `typecheck`, `lint`, `test:coverage`, and `build` on every push and pull request to `main`.

### `.not` chaining and jest-dom/Vitest type augmentation

`frontend/tsconfig.test.json` uses a shared module-identity `paths` mapping so
jest-dom's Vitest matcher augmentation, such as `toBeInTheDocument()`,
type-checks reliably. That augmentation does not currently extend to chained
`.not.toBe()` or `.not.toBeNull()`. No test in this repo uses `.not.` chaining.
Prefer a positive assertion such as `toBeTruthy()` or an equality check phrased
the other way round.

---

## File length

Source and test files in this repo (backend `.py`, frontend `.ts`/`.tsx`,
everything under `tests/`) are kept to roughly 300-350 lines. This isn't
enforced by a linter/CI gate; it's a convention followed by hand, the same
way `docs/mystic_auth/architecture/frontend.md`'s feature-first folder
layout is a convention rather than a generated structure.

When a file grows past that, split along the same lines the rest of the
codebase already uses, rather than introducing a new pattern:

- **A React page component with a large loaded-state render** (a `*Page.tsx`
  with a big JSX tree beyond data-fetching/orchestration): pull the
  presentational part into its own `*Card.tsx`/component file, the same way
  `dashboard/DashboardIdentityCard.tsx` was split out of `DashboardPage.tsx`
  - see [Frontend Architecture](../architecture/frontend.md). The page keeps
  data-fetching, mutations, and dialog state; the extracted component takes
  plain props and owns only presentation.
- **A backend unit/integration test file covering more than one route or
  concern**: split along the same seam the source side already has - e.g.
  `test_policy_authorization_security_unit.py` (covering both
  `policy_crud_routes.py` and `policy_assignment_routes.py`) became
  `test_policy_crud_authorization_security_unit.py` and
  `test_policy_assignment_authorization_security_unit.py`, matching
  `backend/mystic_auth/api/pbac_routes/`'s own crud-vs-assignment file
  split. Where a test file's own internal `# ---- section ----` comments
  already delimit a natural split (e.g. "Redis fail-open regression
  coverage" in `test_refresh_token_unit.py`), split along those instead of
  inventing a new grouping.
- **Test helpers/fixtures shared across a split** (account creation, polling
  helpers, a `_cleanup_*` autouse fixture): factor them into a sibling
  `*_test_accounts.py` module in the same test directory, matching
  `tests/backend/mystic_auth/integration/user_crud/user_test_accounts.py`
  and `.../audit_log/audit_log_test_accounts.py`. An autouse fixture defined
  there only activates for a test module that imports it by name - keep that
  import (even if otherwise unused, guard it with `__all__` for lint) rather
  than moving the fixture into a directory-wide `conftest.py`, which would
  silently widen its scope to every other test file in that directory.

Leave a one-line pointer at the top of a file that got split (see any of the
files named above) explaining what moved where and why, so a reader who
opens the smaller file isn't left wondering where the rest of the coverage
went.

---

## Troubleshooting

- **A test hangs or cannot connect to Postgres from the host:** see
  [PBAC Troubleshooting: database connection issues](../authorization/troubleshooting.md#database-connection-issues).
  A native Postgres install or another project's container can still intercept
  the configured host port.
- **Frontend test cannot resolve a `tests/frontend/...` import:** confirm
  `frontend/vitest.config.ts`'s custom resolver plugin is active. Running Vitest
  from outside `frontend/` bypasses it.
