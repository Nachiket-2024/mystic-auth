# Testing Overview
---

*New to a term here? See the [Testing Glossary](../glossary/testing.md).*

The [Testing Map](README.md) maps each source test file to its execution
boundary. This page keeps the runner, database, and CI rules in one place.
For scenario-level authorization behavior, see [Backend Authorization Test
Detail](backend-authorization.md) and [Frontend Authorization Test
Detail](frontend-authorization.md).
Authentication and page-level scenarios are documented in [Backend
Authentication Test Detail](backend-authentication.md), [Backend Users and
Sessions Test Detail](backend-users-sessions.md), [Frontend Authentication
Test Detail](frontend-authentication.md), and [Frontend Page Test
Detail](frontend-pages-test-detail.md).

## Backend: pytest

1. Config lives in `pytest.ini` at the repo root. It sets `testpaths = tests/backend` and collects coverage for `backend/app` and `backend/mystic_auth`.
2. An HTML report is generated in `htmlcov/` on every run.
3. `--cov-fail-under` is not set in `pytest.ini` because it would also apply to partial local runs.
4. CI enforces the 90% cumulative coverage gate after unit, integration, and security tests append to the same coverage data.

The backend 90% gate is deliberately below 100%: defensive exception
branches, framework wiring, and deployment-only paths are valuable to review
but often cannot be exercised meaningfully in every test environment. A 90%
cumulative gate catches broad regressions while leaving room for those paths
and avoids rewarding brittle tests whose only purpose is to execute framework
glue. A 70% gate would allow too much untested product behavior to regress.

---

### Dedicated test database

1. Outside CI, `tests/backend/conftest.py` redirects `DATABASE_URL`/`APP_DATABASE_URL` to a `mystic_auth_test` database on the same Postgres server, instead of the real `mystic_auth` database a running dev session's own `backend`/`procrastinate_worker` containers use.
2. The first run that needs it creates the database, then applies `alembic upgrade head` (which also creates Procrastinate's own queue tables, via migration `a4c1e8f2b6d3`); every run after that is a fast no-op check.
3. Nothing to configure: this happens automatically, whether you run pytest from the host or via `scripts/mystic_auth/docker/dev/backend-exec.sh`.

**Why this exists**: a shared database was a real, reproducible bug.

1. A test's own teardown fixture (`_procrastinate_app_lifecycle` below) deletes every row from `procrastinate_jobs` after each test.
2. This used to race a real dev-stack `procrastinate_worker` still mid-write on a job the test itself deferred (an audit-log entry, most commonly): it lost the row it needed to persist "succeeded" against, logged a `ConnectorException`, and enough of those repeated eventually took the container down.
3. A dedicated database removes the shared table entirely, not just this one symptom of sharing it.

**Skipped when `CI` is set** (GitHub Actions and effectively every CI provider sets this by convention): CI already provisions its own dedicated, single-purpose `mystic_auth_ci` Postgres service per run (see `.github/workflows/ci.yml`), so there's nothing else there to collide with.

---

### App wrapper

`tests/backend/app/` contains one unit module,
`test_main_global_exception_handler_unit.py`. It verifies safe 500 responses
and reporting of unexpected exceptions at the application boundary.

### Unit tests

`tests/backend/mystic_auth/unit/` contains 105 modules. Its subdirectories
mirror the backend implementation and cover authentication, authorization and
PBAC, condition validation, rate limits, middleware, logging, email tasks,
users, sessions, deletion/purge, database and Valkey helpers, and settings.
The [Backend Unit Tests](backend-unit.md) page explains every
file.

### Integration tests

`tests/backend/mystic_auth/integration/` contains 48 modules. They exercise
audit logs, policy CRUD and assignment, authorization checks, auth flows,
health, OAuth, sessions, rate limits, user export and lifecycle, and cache
behavior against real test infrastructure. See [Backend Integration
Tests](backend-integration.md).

### Security and performance tests

`tests/backend/mystic_auth/security/` contains seven attacker-shaped tests for
abuse, spoofing, invalid conditions, policy tampering, grant escalation,
privilege escalation, and restricted database privileges. The least-privilege
case is skipped without `APP_DATABASE_URL`.

`tests/backend/mystic_auth/performance/` contains two informational timing
modules for authorization plus login/audit-log paths. See [Backend Security
and Performance](backend-security-performance.md).

---

### Concurrency/race tests vs. throughput load testing

These are two different kinds of "load" and only one of them lives in this suite:

- **Concurrency/race correctness** (does the app stay *correct*, not just fast, when N requests hit the same shared state at once) is regular pytest coverage, living inline in the relevant `integration/` file rather than a separate directory: e.g. `test_signup_verify_concurrency_integration.py` (duplicate-signup race, concurrent-identical-signup race), `test_refresh_token_integration.py::test_concurrent_refresh_with_the_same_token_only_one_succeeds` (refresh-token double-spend), `test_login_lockout_race_integration.py` (failed-login lockout counter under a concurrent burst), `test_policy_concurrency_integration.py` (concurrent policy edits), and the self-role-change regression tests in `test_user_admin_management_integration.py` / `test_bulk_role_assignment_integration.py`. These are cheap, deterministic, and run in every CI pass alongside the rest of `integration/`. Add a new one next to the feature it protects whenever a fix closes a race, the same way the tests above did.
- **Throughput/capacity load testing** (how many req/s before latency or error rate degrades) is deliberately **not** part of this suite: it needs an isolated environment (not a shared CI runner), pass/fail thresholds tied to a real deployment's expected traffic, and it rots fast if left unattended in-repo. `scripts/mystic_auth/load-test/load_test.py` is a small `httpx`-based script for this, run by hand against a local-prod/staging stack before a release, not on every push. See its own header comment for usage and the per-IP rate-limit budget it needs to stay under to measure real capacity rather than the rate limiter.

The local audit run on 2026-09-23 exercised 500 `/health/ready` requests at
50-request concurrency with four worker processes and 80 authenticated
`/auth/me` requests at 20-request concurrency. Both runs completed with zero
server errors. These are baseline measurements for the current Docker stack,
not universal production SLOs.

---

**Running:**

See [Frontend Browser E2E Tests](frontend-e2e.md) for the Playwright suite's required
stack setup, seeded accounts, full coverage list, the axe accessibility scan,
and the opt-in live-deployment smoke test - the commands below just start it.

```bash
# From repo root, against local Postgres/Valkey (see env/mystic_auth/.env)
python -m pytest tests/backend/app -q
python -m pytest tests/backend/mystic_auth/unit -q
python -m pytest tests/backend/mystic_auth/integration -q
python -m pytest tests/backend/mystic_auth/security -q
python -m pytest tests/backend/mystic_auth/performance -q

# Inside the Docker network. This avoids host/container Postgres port conflicts.
# scripts/mystic_auth/docker/dev/backend-exec.sh (or .ps1/.cmd) wraps the --user root and
# MSYS_NO_PATHCONV workarounds this needs. See
# docs/mystic_auth/docker/dev-workflow.md#running-a-one-off-command-inside-a-container.
scripts/mystic_auth/docker/dev/backend-exec.sh python -m pytest tests/backend/

# Browser matrix: Chromium desktop/mobile, Firefox desktop, WebKit desktop.
npm run test:browser --prefix frontend -- --project=chromium-desktop
npm run test:browser --prefix frontend -- --project=chromium-mobile
npm run test:browser --prefix frontend -- --project=firefox-desktop
npm run test:browser --prefix frontend -- --project=webkit-desktop

# Local capacity baseline, against a running Docker stack.
python scripts/mystic_auth/load-test/load_test.py --base-url http://localhost:8000 \
  --scenario health --requests 500 --concurrency 50 --workers 4
```

CI (`.github/workflows/ci.yml`) runs app-wrapper, unit, integration, and
security suites against GitHub Actions service containers (Postgres 15, Valkey 9.1.2-alpine)
on every push and pull request to `main`. App-wrapper and unit tests create the
first coverage base. Integration and security tests pass `--cov-append`, so the
security step can enforce the cumulative `--cov-fail-under=90` gate. Performance
tests also run as non-blocking informational checks because timing is noisy on
shared runners.

---

## Frontend: Vitest

Config lives in `frontend/vitest.config.ts`. Tests live in `tests/frontend/`
outside `frontend/src/`, wired through a custom Vite resolver plugin. Coverage
uses the `v8` provider with `text`, `json`, and `html` reporters. Thresholds are
enforced only by `vitest run --coverage`, so CI runs `test:coverage`.

The frontend thresholds are a regression floor, not a claim that every line is
equally valuable: the current measured baseline is approximately
90%/80%/82%/91% for statements/branches/functions/lines, while the enforced
85%/78%/79%/86% floors leave a small jitter budget. Generated styling, thin
framework adapters, defensive error branches, and browser-only behavior are
covered more effectively by integration/E2E checks than by forcing 100% unit
coverage. Lowering the floors to 70% would allow meaningful UI regressions to
hide; raising them to 100% would incentivize low-value tests and flakiness.

---

### App wrapper

`tests/frontend/app/` contains three Vitest modules for routing, legal pages,
and status pages, plus three browser specs for landing, legal, and status
pages. These protect the host application boundary.

### Unit tests

`tests/frontend/mystic_auth/unit/` contains 96 modules for API clients,
refresh and session lifecycle, authorization helpers, audit presentation,
password rules, stores, theme, shared UI, error reporting, translation parity,
and mobile overflow. See [Frontend Unit Tests](frontend-unit.md).

### Integration tests

`tests/frontend/mystic_auth/integration/` contains 33 rendered-page modules
for audit logs, auth, dashboard, active sessions, PBAC UI, policies,
permissions, rate limits, users, and account settings. API responses are
controlled, so these prove frontend composition rather than backend
authorization. See [Frontend Integration Tests](frontend-integration.md).

### Browser E2E tests

The 26 Playwright specs under `tests/frontend/**/e2e/` add real browser
navigation, focus, keyboard, responsive, accessibility, disposable-account,
real seeded-account, and opt-in live-deployment checks. See [Frontend Browser
E2E Tests](frontend-e2e.md).

---

**Running:**

```bash
npm run typecheck --prefix frontend   # app, node, and test tsconfigs
npm run lint --prefix frontend        # eslint over frontend/ and tests/frontend/
npm run test --prefix frontend         # vitest run (no coverage collection/thresholds)
npm run test:coverage --prefix frontend  # vitest run --coverage (thresholds enforced)
```

CI runs `typecheck`, `lint`, `test:coverage`, and `build` on every push and pull request to `main`.

---

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
  already delimit a natural split (e.g. "Valkey fail-open regression
  coverage" in `test_refresh_token_unit.py`), split along those instead of
  inventing a new grouping.
- **Test helpers/fixtures shared across a split** (account creation, polling
  helpers, a `_cleanup_*` autouse fixture): factor them into a sibling
  `*_test_accounts.py` module in the same test directory, matching
  `tests/backend/mystic_auth/integration/user/user_test_accounts.py`
  and `.../audit_log/audit_log_test_accounts.py`. An autouse fixture defined
  there only activates for a test module that imports it by name - keep that
  import (even if otherwise unused, guard it with `__all__` for lint) rather
  than moving the fixture into a directory-wide `conftest.py`, which would
  silently widen its scope to every other test file in that directory.

Leave a one-line pointer at the top of a file that got split (see any of the
files named above) explaining what moved where and why, so a reader who
opens the smaller file isn't left wondering where the rest of the coverage
went.

## Adding a feature or test: documentation update path

For every new test, update the page that owns its execution boundary and the
behavior index in [Testing Map](README.md) when it protects a cross-cutting or
security property:

- pure backend decisions → [Backend Unit Tests](backend-unit.md);
- real database/Valkey workflows → [Backend Integration Tests](backend-integration.md);
- attacker-shaped or restricted-role checks → [Backend Security and Performance](backend-security-performance.md);
- frontend unit/rendered/browser behavior → the matching frontend unit,
  integration, or E2E page;
- a behavior spanning layers → its detail page as well as the boundary page.

Keep the filename convention (`test_*_unit.py`, `test_*_integration.py`,
`test_*_security.py`, `*.test.ts[x]`, `*.spec.ts`), state what the test proves
and does not prove, and add any known skip, timing sensitivity, or environment
dependency beside that file's entry. Reviewers should treat a new or renamed
test without a catalogue update as incomplete.

---

## Troubleshooting

- **A test hangs or cannot connect to Postgres from the host:** see
  [PBAC Troubleshooting: database connection issues](../authorization/troubleshooting/database-connection.md#database-connection-issues).
  A native Postgres install or another project's container can still intercept
  the configured host port.
- **Frontend test cannot resolve a `tests/frontend/...` import:** confirm
  `frontend/vitest.config.ts`'s custom resolver plugin is active. Running Vitest
  from outside `frontend/` bypasses it.

---
