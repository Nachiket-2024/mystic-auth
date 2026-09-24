# Test Tooling and CI
---

*New to a term here? See the [Testing Glossary](../glossary/testing.md).*

Tooling tests protect the scripts that make the test environment reproducible.
They are not product behavior tests, but a broken helper can invalidate every
backend or browser result. CI workflow files are described here because they
define which boundary is authoritative and which checks are informational.

---

## Shell regression tests

- `tests/scripts/mystic_auth/env-tools/test-env-tooling.sh` verifies
  environment-tool behavior and safe handling of configured values.
- `tests/scripts/mystic_auth/db/test-restore-drill.sh` verifies disposable
  database restore-drill behavior and cleanup.
- `tests/scripts/mystic_auth/lint/check-script-paths.sh` verifies repository
  path references in scripts and tests remain resolvable.
- `tests/scripts/mystic_auth/lint/check-split-paths.sh` verifies split-file
  references and generated paths remain usable.
- `tests/scripts/mystic_auth/upstream-sync/test-sync-upstream.sh` verifies
  upstream synchronization checks and safe handling of changed files.

---

## Collection boundaries

Backend pytest modules live under `tests/backend/`. Frontend Vitest modules
live under `tests/frontend/`, while Playwright files use the `*.spec.ts`
pattern under `tests/frontend/**/e2e/`. The application-owned frontend tests
are intentionally included in the frontend collection but documented
separately from MysticAuth feature tests.

The real-account permission matrix is an environment-dependent browser test:
it needs the dev stack and the seeded accounts. The live deployment smoke is
opt-in. A normal mocked browser run must not be interpreted as proof of backend
authorization.

---

## CI interpretation

The CI workflows under `.github/workflows/` assemble lint, type checking,
backend pytest, frontend Vitest, Playwright, shell regressions, and security
checks. Read the job's working directory and test command together with its
name. Performance checks are diagnostic and may be non-blocking; skipped live
or deployment-specific checks are expected unless their environment is
configured.

When a test changes, update the nearest catalogue page and the relevant
cross-cutting coverage page if the behavior spans more than one layer. Keep
the source path in the documentation so a rename is easy to detect during
review.

There is no checked-in path/behavior index lint: CI can catch a deleted test
file when its command runs, but it does not detect a renamed or semantically
stale catalogue entry. This is a real maintenance gap. Until such a check is
added, review every test rename/addition against [Testing Map](README.md) and
the boundary page as part of the PR.

---

## See also

- [Test Catalogue](README.md)
- [Testing Overview](overview.md)
- [Frontend Browser E2E Tests](frontend-e2e.md)
