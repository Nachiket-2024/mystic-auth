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
  restores of the configured app and Bugsink databases, HMAC checks, populated
  database row-count parity, the empty dev Bugsink case, scratch cleanup, and
  a configured `POSTGRES_USER` rather than a hardcoded `postgres` role.
- `tests/scripts/mystic_auth/lint/check-script-paths.sh` verifies repository
  path references in CI, scripts, docs, and tests remain resolvable. The CI
  entrypoint is `ci/mystic_auth/tooling.sh script-paths`.
- `tests/scripts/mystic_auth/lint/check-split-paths.sh` verifies split-file
  references and generated paths remain usable.
- `tests/scripts/mystic_auth/lint/check-image-digests.sh` verifies every
  `@sha256:...`-pinned image digest in `docker/{mystic_auth,app}/compose/*.yml`
  is a syntactically valid 64-character digest, so a malformed pin fails CI
  instead of `docker pull`/`docker compose up` on a clean host.
- `tests/scripts/mystic_auth/lint/check-log-rotation.sh` verifies every
  Compose service sets bounded `json-file` log rotation.
- `tests/scripts/mystic_auth/lint/check-ci-action-pinning.sh` verifies every
  third-party GitHub Actions reference uses a commit SHA instead of a mutable
  tag.
- `tests/scripts/mystic_auth/lint/check-readonly-rootfs.sh` verifies the
  production-shaped services declare `read_only: true`; services that need a
  writable location use an explicit volume or tmpfs instead.
- `tests/scripts/mystic_auth/upstream-sync/test-sync-upstream.sh` verifies
  upstream synchronization: history handling, the safety nets (silent partial
  apply, executable-bit self-heal, a missing stage file), and the ownership
  guard. It sources the `test-sync-upstream-history.sh`,
  `test-sync-upstream-safety.sh`, and `test-sync-upstream-ownership.sh` phases
  beside it, so run it through the entry point.
- `tests/scripts/mystic_auth/db/test-backup-freshness.sh` verifies the
  backup-freshness check script correctly flags a stale or missing backup.
- `tests/scripts/mystic_auth/db/test-backup-encryption-check.sh` verifies the
  artifact check rejects plaintext dumps, missing or malformed HMAC sidecars,
  and mismatched HMACs when the key is supplied.
- `tests/scripts/mystic_auth/docker/test-backend-host-run.sh` verifies the
  host-run helper derives localhost service URLs from configured host ports
  without rewriting the configured application database name; its fixture uses
  `example_app_db` so a hardcoded `mystic_auth` suffix cannot pass unnoticed.

The workflow-facing wrappers are split by ownership: `ci/mystic_auth/` owns
template backend, browser, tooling, and backup checks; `ci/app/` owns app
backend and frontend checks. `ci/mystic_auth/frontend-e2e-stack.sh` prepares,
boots, seeds, smoke-checks, logs, and tears down the isolated Compose stack
used by each browser E2E job. `.github/workflows/ci.yml` remains the shared
orchestrator for the browser project matrix, services, and combined
Docker/Compose checks.

---

## Collection boundaries

Backend pytest modules live under `tests/backend/`. Frontend Vitest modules
live under `tests/frontend/`, while Playwright files use the `*.spec.ts`
pattern under `tests/frontend/**/e2e/`. The application-owned frontend tests
are intentionally included in the frontend collection but documented
separately from MysticAuth feature tests.

The real-account permission matrix is an environment-dependent browser test:
it needs the dev stack and the seeded accounts. After migrations, seed those
accounts with the upstream-owned
`local-scripts/mystic_auth/seed-user-permission-matrix.py` helper. The local
Docker command sequence is in [CI Local Validation](../cicd/local-validation.md).
Keep downstream project helpers under `local-scripts/app/`; the shared fixture
must not be moved back into that downstream-owned directory. The live
deployment smoke is opt-in. A normal mocked browser run must not be interpreted
as proof of backend authorization.

---

## CI interpretation

The workflow under `.github/workflows/ci.yml` calls the ownership-specific
entrypoints under `ci/mystic_auth/` and `ci/app/`, then assembles the shared
lint, type checking, backend pytest, frontend Vitest, Playwright, shell
regressions, Docker, and security checks. Read the job's ownership label and
test command together with its name. Performance checks are diagnostic and
may be non-blocking; skipped live or deployment-specific checks are expected
unless their environment is configured.

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

---
