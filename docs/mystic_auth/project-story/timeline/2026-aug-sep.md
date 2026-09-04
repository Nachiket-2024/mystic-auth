# How It Evolved: August-September 2026

---

### Commit 54: 2 August, 2026

`c4c8caf`: "Revamped UI with pagination/filtering and backend logout-all/session management fixes"

- UI revamped with pagination and filtering.
- Backend logout-all/session-management fixes.
- The template changed across UI, backend behavior, Docker, CI, tests, and documentation.
- Active Sessions and Last Login now update immediately after login and logout-all via real-time session events.
- "Me"-scoped query caches cleared correctly so data can't leak between accounts in the same browser tab.
- Password changes keep the current device's session while revoking every other one.

*241 files changed · +9,490/-2,240 lines*

---

### Commit 55: 3 August, 2026

`292a105`: "Split large files, added backend types/tests, fixed auth form errors and made structural changes"

- Backend: `route_helpers.py` renamed `get_or_404.py`, `policy_shared.py` renamed `policy_permissions.py`, condition modules moved into a `condition_types/` subfolder.
- Frontend audit-log UI reorganized into `authorization_log/` and `security_log/` subfolders, each with its own `columns.tsx`/`queries.ts`; `UsersPage.tsx` (142 lines) gained a dedicated `usersColumns.tsx` (162 lines).
- The biggest change wasn't visible in the commit message at all: three giant integration test files (`test_auth_api_integration.py`, 799 lines; `test_authorization_routes_integration.py`, 568 lines; `test_user_routes_integration.py`, 963 lines) deleted outright and replaced by ten focused files split by flow (`test_login_integration.py`, `test_logout_password_reset_integration.py`, `test_authorization_check_integration.py`, `test_policy_action_separation_integration.py`, `test_policy_assignment_integration.py`, `test_policy_crud_integration.py`, `test_refresh_token_integration.py`, `test_user_account_lifecycle_integration.py`, `test_user_list_and_update_integration.py`, `test_user_self_service_routes_integration.py`), plus shared account-helper files.
- This is the first appearance of the "split when a file passes the length guideline" convention this repo still follows.

*109 files changed · +3,724/-2,844 lines*

---

### Commit 56: 3 August, 2026

`d07cfef`: "Set auth cookies to strict and added caddy production compose"

- Auth cookies set to strict.
- A Caddy production Compose file added: new `docker-compose.local-prod.yml` (348 lines) and `docker/Caddyfile` (21 lines), alongside reworked `backend.Dockerfile`/`frontend.Dockerfile`/`nginx.frontend.conf`.
- `session_service.py`/`session_repository.py` grew (63 and 33 lines), and a new frontend `sessionRotationGuard.ts` (38 lines) appeared.
- An Alembic migration removing a stale `promote_to_admin` action left over from the RBAC era.

*114 files changed · +1,823/-976 lines*

---

### Commit 57: 5 August, 2026

`d276d7e`: "Fixed silent-apply and alembic-branch handling in sync-upstream, added backend-exec wrappers"

- Running a real upstream sync with Claude Code against another project surfaced four real gaps in `sync-upstream.sh`: a binary file mid-patch could make `git apply --3way` silently drop the rest of the diff while still looking like a normal result, nothing caught two migrations landing on the same Alembic head, comment-only rewording upstream kept forcing the same conflict every sync, and Windows/Git Bash friction was still a manual workaround instead of just working.
- All four got fixed: `sync-upstream.sh` rewritten (241 lines) with a new `check-alembic-heads.sh` (110 lines) and a much larger `test-sync-upstream.sh` (346 lines, more than double its previous size).
- `scripts/` reorganized into `upstream-sync/`, `docker/`, and `db/` subfolders, with new `backend-exec.sh`/`.ps1`/`.cmd` wrappers.

*30 files changed · +898/-385 lines*

---

### Commit 58: 5 August, 2026

`0a663ee`: "Set up env templates, deployment guides for dev, Cloudflare Tunnel, and public server"

- Env templates and deployment guides set up for dev, Cloudflare Tunnel, and public server modes.
- Three separate new docs (`deployment/dev.md`, 143 lines; `local-prod.md`, 272 lines; `prod.md`, 137 lines) replacing one combined guide.
- New `.env.local-prod.example`/`.env.prod.example` files.
- Screenshots reorganized under `screenshots/mystic_auth/`.

*45 files changed · +1,080/-225 lines*

---

### Commit 59: 7 August, 2026

`f56956e`: "Restructured codebase, PBAC permission revalidation, password reset token verification fix"

- Codebase restructured.
- PBAC permission revalidation added.
- Password-reset token verification fixed.
- Heaviest touch in `users/`, `pbac_routes/`, `account_settings/`, and the authorization/security test suites.

*204 files changed · +1,513/-1,031 lines*

---

### Commit 60: 8 August, 2026

`a6c0c45`: "Enabled downstream navbar customization and fixed toast overlap"

- Downstream navbar customization enabled: `AppLayout.tsx` and `Navbar.tsx` gained an `extraNavbarContent` prop.
- A toast overlap bug fixed in `toasterInstance.ts`.

*9 files changed · +63/-13 lines*

---

### Commit 61: 9 August, 2026

`5fdbc63`: "Added exponential backoff to Taskiq email retries via a new taskiq_scheduler service"

- Exponential backoff added to Taskiq email retries via a new `taskiq_scheduler` service.
- Wired into all three Docker Compose files (dev, local-prod, prod) at once.
- A matching entry added to the known-issues doc.

*21 files changed · +244/-70 lines*

---

### Commit 62: 9 August, 2026

`d088ecb`: "Implemented DEFAULT_APP_POLICIES for downstream auto-grant"

- `DEFAULT_APP_POLICIES` implemented (`core/settings.py` +10 lines, `default_policies.py` +31 lines).
- Lets a downstream project grant a second default policy to every user without hand-editing upstream's signup/OAuth2 code.

*12 files changed · +140/-5 lines*

---

### Commit 63: 10 August, 2026

`a2c8bd4`: "Coloured action buttons with dark-mode hover, decoupled DEFAULT_APP_POLICIES from test assertions"

- Row-action buttons colored with dark-mode-aware hover states (the bulk of the change is in `TableActionButton.tsx`, 86 lines).
- A downstream bug report caught that the OAuth2 unit tests, and three auth/authorization integration tests asserting exact policy sets, only passed because `DEFAULT_APP_POLICIES` happened to be empty in this repo's own CI.
- The unit tests fixed to mock the extension point directly, and the integration suite got a conftest that forces it empty, instead of either depending on that env var.

*14 files changed · +96/-40 lines*

---

### Commit 64: 12 August, 2026

`4a4d6ff`: "Added sidebar hover state and applied FAST_HOVER_TRANSITION consistently"

- Sidebar links got a hover state (`Sidebar.tsx` +79 lines).
- The same fast, snappy hover transition (`FAST_HOVER_TRANSITION`, new in `buttonStyles.ts`) extracted and applied consistently across buttons, pagination, and table action buttons.

*9 files changed · +188/-114 lines*

---

### Commit 65: 15 August, 2026

`f7c6fb3`: "Added multilingual support with language toggle and error translations"

- A language toggle and translations store added on the frontend.
- Backed by a new `AppError` exception type that carries an error code/params through the API so the frontend can look up a translated message instead of showing the raw English `detail` string.
- Four full translation namespaces landed (`en`/`gu`/`hi`/`mr`, 10 files each).
- `local-scripts/{dev,local-prod,prod}/` appeared for the first time.

*194 files changed · +4,809/-712 lines*

---

### Commit 66: 18 August, 2026

`03f55f8`: "Implemented account deletion, PBAC guard, command palette; patched IP spoofing"

1. Self-service account deletion, plus admin purge, via a new `user_lifecycle/` backend module.
2. A PBAC grant guard stopping a user from granting a policy more privileged than their own.
3. A command palette (Cmd+K).
4. Route-loading/font-size UI infrastructure.
5. hi/gu/mr translations added across every namespace.
6. Fixes: an `X-Forwarded-For` spoofing bug, a command-palette i18n leak, a stale mypy suppression.
7. Docs brought up to date to match, split one page per authentication flow with a diagram each.

*304 files changed · +8,656/-1,702 lines*

---

### Commit 67: 20 August, 2026

`5498c55`: "Replaced Taskiq with Procrastinate, added session geolocation, rate-limit dashboard, enforced JWT iss/aud"

1. Taskiq replaced with Procrastinate for background jobs.
2. Manage Sessions gained offline GeoIP-based location.
3. JWT issuer/audience claims enforced.
4. An admin rate-limits dashboard added, via a new `rate_limits/` frontend module.
5. A user-export row cap added.
6. Docs overhauled to match: stale references removed, diagrams redrawn vertically and fixed for legibility, every page restructured tutorial-style.

*266 files changed · +5,595/-2,054 lines*

---

### Commit 68: 22 August, 2026

`e0885b2`: "Added brand theming, legal pages, fixed session/PBAC issues"

1. Brand colors and legal consent pages added, via a new `landing_page/` module with its own translations.
2. A least-privilege Postgres role added.
3. Redis session revocation fixed to properly confirm password resets, deletions, and admin actions.
4. PBAC permission filtering fixed, with 5 seeded policies and pagination.
5. Cookie, React, and local DB issues patched, with more tests.
6. OAuth2 failure handling fixed with specific error codes for deleted, deactivated, cancelled, and expired states; rate-limited routes now redirect instead of returning raw JSON.
7. Audit logging moved to the Procrastinate background worker.
8. An nginx route leak fixed, and three Docker Compose databases split.

*351 files changed · +12,778/-4,096 lines*

---

### Commit 69: 29 August, 2026

`dea159d`: "Implemented granular permissions, bulk actions, and scheduled backups"

The largest single commit in the project's history by line count.

1. Fixed a duplicate security-header bug in `nginx.frontend.conf`.
2. Fixed a `DATABASE_URL` override that silently shadowed `env_file` and had broken the stack mid-audit.
3. Fixed a hardcoded Docker subnet collision between the two production-style Compose files.
4. Fixed a pydantic circular-reference flake in policy list serialization, by building schemas row by row.
5. Rebuilt the PBAC frontend surface: bulk actions on the Users page, the permission catalog, and an effective-permissions viewer, verified across themes, font sizes, and languages.
6. Attacked the backend directly the way a real attacker would (forged JWTs, IDOR, mass assignment, privilege self-granting, IP spoofing, and more), all correctly blocked.
7. Added client-side length validation matching the backend's limits.
8. Added a `Retry-After` header with a translated wait-time message on login lockout.
9. Closed the "backups are scripted but nothing schedules them" gap with an on-by-default `db_backup` service on both production Compose files.
10. Swept the docs for staleness, including the PBAC component table and color-coded flow diagrams; trimmed comments across all files and tests to be concise. See the [security decisions](../../security/decisions.md) and [concerns](../../concerns/README.md) pages for the lasting details.

*591 files changed · +46,875/-31,037 lines*

---

### Commit 70: 4 September, 2026

`cfae864`: "Set up ngrok, Tailscale Funnel local-prod modes and Playwright E2E tests"

1. ngrok and Tailscale Funnel local-prod Docker modes set up, with end-to-end tunnel verification.
2. Docker, scripts, and env files reorganized into subfolders; deployment docs split per tunnel type.
3. A new `docs/glossary/` section added: terms used throughout the docs defined in one place for the first time.
4. CI extended with Compose validation.
5. Playwright E2E browser tests added.
6. Raw field values stripped from 422 validation error responses.
7. Postgres backups switched to `pg_dump` custom format with `pg_restore --list` integrity checks.
8. Comments trimmed across all files.

*691 files changed · +38,992/-36,588 lines*

---

### Commit 71: 4 September, 2026

`5aff4be`: "Blocked self-role privilege escalation, patched security headers and Docker images"

Security hardening driven by a manual adversarial pentest by Claude Code and an automated audit scan (Bandit/ZAP/testssl.sh/pip-audit/npm audit) against the local-prod-ngrok stack, both checked into the repo for reference.

1. **The pentest's one real finding, fixed:** a caller holding only `users:assign_role` could relabel *themselves* to `admin` via `PATCH /users/{email}/role` or its bulk counterpart. Not exploitable today (nothing branches on `role == "admin"`), but a real escalation path waiting for the first downstream shortcut that does. Now rejected outright (`403 CANNOT_CHANGE_OWN_ROLE`) on both endpoints, with regression tests, re-verified live against the running stack.
2. `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy`/`Cross-Origin-Embedder-Policy` added on the backend and the frontend's nginx layer; frontend CSP tightened; HSTS moved onto the real TLS terminator (`docker/Caddyfile`); `nginx server_tokens off`.
3. Base images bumped and pinned to patched tags, with `apt-get upgrade`/`apk upgrade` re-run every rebuild; `pip`/`setuptools` stripped from the backend runtime image entirely.
4. `RateLimiterService.rate_limited(...)` gained per-endpoint `max_requests`/`window_seconds` overrides, closing a tracked gap in the concerns doc.
5. Windows entry points (`.ps1`/`.cmd`) added for `sync-upstream.sh`/`check-alembic-heads.sh`.
6. Two missing `list[BulkItemResult]` type annotations added in `bulk_policy_routes.py`/`bulk_permission_routes.py`, caught by running `mypy` before commit.
7. The project-story timeline split from two year-sized files into four smaller ones, each closer to this repo's usual doc length.
8. `selfPermissionMutationGuardArming.test.tsx`'s four `expect(markSpy).not.toHaveBeenCalled()` calls rewritten as `expect(markSpy).toHaveBeenCalledTimes(0)`, matching this repo's existing `.not` chaining convention (documented in `docs/mystic_auth/testing/overview.md`) after a clean CI install caught what a stale local `node_modules` had been quietly tolerating.
9. Docs updated throughout to match every change above.

*56 files changed · +2,340/-2,002 lines*

---

### Commit 72: 5 September, 2026

"Ran security audit, migrated backend to Alpine, fixed entrypoint and token leak"

A live security audit (Bandit, Semgrep, Trivy, gitleaks, pip-audit, npm audit, a full OWASP ZAP active scan, plus a manual adversarial pentest and a real-browser pass) against a running local-prod-ngrok deployment, re-run clean against a completely fresh rebuild of the stack, followed by fixing what it turned up.

1. CSP's `style-src` dropped `'unsafe-inline'` for three static `sha256-` hashes covering Chakra/Emotion's fixed style tags.
2. Backend base image migrated Debian to Alpine, taking Trivy from 57 High/Critical to 0 on the runtime image.
3. A real login-lockout race fixed: one atomic Redis `INCR` instead of a check-then-increment pair that let extra failed attempts through under a burst.
4. Production scaling made configurable (`UVICORN_WORKERS`, `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`), measured live at roughly 260 to 360 req/s on `GET /auth/me` going from 1 to 4 workers.
5. The real Caddy production TLS path tested for the first time, catching and fixing a duplicate `Strict-Transport-Security` header, which also closed a gap where the ngrok/cloudflare/tailscale tunnel modes never sent HSTS on the frontend's own pages at all.
6. Docs swept for staleness against the above, and a glossary cross-link added wherever a doc used a term the glossary already defined.
7. A self-healing Docker entrypoint (`docker/dockerfiles/backend-entrypoint.sh`) replaced the manual "remember to `docker volume rm`" step left over from the Alpine migration: it fixes `backend_logs` ownership on a stale volume, then drops to `app` via `su-exec`.
8. An optional `BACKUP_UPLOAD_COMMAND` hook added to `db_backup` (all four prod-shaped Compose files) and `scripts/db/db_backup.sh`, so an operator can ship dumps off-host with one env var.
9. A real token leak caught in manual review: Procrastinate's own job-lifecycle logging was echoing each job's full arguments to stdout, including the raw verification/reset token embedded in `send_email_task`'s email body. Fixed by raising the `procrastinate` logger to `WARNING`.
10. Bandit, Semgrep, pip-audit, npm audit, Gitleaks, and Trivy re-run clean against the rebuilt images; a full ZAP active scan came back 141 PASS/0 FAIL, up from the prior baseline scan's 138.
11. A fresh manual pentest with two new accounts: IDOR, self-escalation, forged/tampered JWTs, SQL/XSS injection, OAuth open-redirect, rate limiting, and enumeration, all 17 attempts blocked; a real-browser pass confirmed stored XSS renders inert and every admin route 403s for a non-admin.
12. A load test against the real built image found the deployment's actual ceiling: throughput plateaus around 520&ndash;560 req/s past 500 concurrent, with `/health/ready` tail latency ballooning under 1,000 from Postgres pool saturation.
13. Stale local audit-report folders deleted; all gitignored, so this touched no tracked files.
14. Every CI job re-run locally against the pending changes before commit: a real percent-format lint error fixed in `test_invalid_condition_payload_security.py`, then ruff/mypy/bandit/pip-audit, all 27 migrations, 823 backend unit + 272 integration + 36 security (93.44% coverage) + 7 performance tests, 544 frontend tests across 86 files, a full 89-commit Gitleaks history scan, both Docker images, and the 58-test Playwright E2E suite, all clean.

*111 files changed*

---

See [February-July 2026](2026-feb-jul.md) for the start of the year, or [How It Evolved](README.md) for the milestones overview.

---
