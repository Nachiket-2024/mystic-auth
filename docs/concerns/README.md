# Known Issues, Limitations & Technical Debt

Tracked deliberately rather than left as silent gaps. Each entry reflects something actually found during the documentation/production-readiness audit — nothing speculative. Entries resolved during this same pass are marked accordingly with a link to where the fix landed.

## Security

### Email addresses are matched case-sensitively

**Description**: `users.email` has a unique constraint but no case-insensitive collation (no `citext`, no functional lowercase index), and nothing in the application layer normalizes email casing before a lookup or write (`user_crud/user_crud_modules/user_email_crud.py::get_by_email`, `signup_schema.py`/`login_schema.py`'s `EmailStr` fields do format validation only, not casing).

**Impact**: `User@Example.com` and `user@example.com` can register as two distinct accounts, bypassing the unique constraint's intent; a user who signs up with one casing and later logs in/resets their password with different casing gets "no such account" instead of it being recognized as the same address.

**Why it exists**: `EmailStr` validates RFC-5322 shape, not casing; the unique constraint and every lookup compare the raw string as typed.

**Possible fix**: Normalize (lowercase) the email at every write/read boundary — cheapest single choke point would be a `field_validator` on the shared email fields in each `*_schema.py` (`signup_schema.py`, `login_schema.py`, `password_reset_request_schema.py`, user-admin route path params) plus the OAuth2 path (`oauth2_service.py` builds a raw dict, not a schema). Left undone in this pass because it touches every auth entry point and needs full regression coverage across signup/login/OAuth2/password-reset/admin routes to land safely — a good candidate for a focused follow-up PR with its own test additions, not a drive-by fix bundled into a documentation pass.

**Priority**: Medium — real but not exploitable beyond user confusion/duplicate accounts; no privilege escalation.

### Redis has no password (`requirepass` unset)

**Description**: Neither `docker-compose.yml`/`docker-compose.prod.yml` nor `core/settings.py`/`redis/client.py` configure Redis authentication.

**Impact**: Anyone who can reach the Redis port can read/write rate-limit counters, lockout state, refresh-token jtis, and single-use tokens. Low actual risk today since `docker-compose.prod.yml` doesn't publish the Redis port to the host (internal Docker network only) — but a misconfigured network policy or a host-level firewall gap would expose it.

**Why it exists**: Never added; not required for the current internal-network-only deployment shape.

**Possible fix**: Set `requirepass` in the Redis service config, wire a `REDIS_PASSWORD` setting through `settings.py` → `REDIS_URL`, and update both compose files.

**Priority**: Low today (internal-network-only exposure), worth doing as defense-in-depth before any deployment that publishes the Redis port.

### No automated database backups

**Description**: [Deployment Guide](../deployment/guide.md#backups) documents a manual `pg_dump` runbook only — no scheduled job exists anywhere in this repo.

**Impact**: Data loss risk in any real deployment until an operator sets up their own backup schedule.

**Why it exists**: No specific production host/cloud target is assumed by this template, so there's nothing to hang a cron job on generically.

**Possible fix**: Document (already done) is the floor; a real deployment should add a scheduled `pg_dump` (cron, a managed Postgres provider's built-in backups, or a sidecar container) — provider-specific, left to whoever deploys this.

**Priority**: High for any real production use, N/A for local development.

## Reliability

### `taskiq_worker` crash-loops for ~30-60s on a fresh Redis stream before stabilizing

**Description**: Discovered during this pass's live Docker validation (`docker compose up --build` against a brand-new `postgres_data`/Redis state): `taskiq_worker` repeatedly crashed and was restarted by its own `--reload` supervisor (dozens of times, several seconds apart) with `redis.exceptions.ResponseError: NOGROUP No such key 'taskiq' or consumer group 'taskiq' in XREADGROUP with GROUP option`, before stabilizing on its own once the Redis Stream consumer group came into existence. A real signup request during this window still succeeded end-to-end — the enqueued email task was picked up and the email sent successfully once the worker stabilized — so no request-facing failure was observed, only worker log noise and delayed (not lost) email delivery.

**Impact**: On a fresh environment (first `docker compose up`, or any Redis data reset), verification/password-reset emails enqueued in the first ~30-60 seconds are delayed until the worker stabilizes, rather than sent immediately. No task was lost in this observation — `--reload` kept restarting the worker until it succeeded.

**Why it exists**: Likely a startup race between the broker/worker attempting to read from the Redis Stream consumer group before `taskiq-redis` has created it (typically created lazily on first successful read with `MKSTREAM`, or only once Redis itself is fully warmed up right after a fresh `docker compose up --build`).

**Possible fix**: Investigate whether `taskiq-redis`'s `RedisStreamBroker` supports eagerly creating the consumer group on broker startup rather than relying on the first read to trigger it, or add an explicit startup delay/retry in the `taskiq_worker` command. Low priority since the existing `--reload` supervisor already makes this self-healing with no lost tasks observed.

**Priority**: Low — self-heals, no data loss observed, only affects the first ~minute of a fresh environment's life.

### Rate limiter fails closed on a Redis outage

**Description**: `rate_limiter_service.record_request` catches all Redis exceptions and returns `False` ("not allowed"). Since every auth route is wrapped in `@rate_limiter_service.rate_limited(...)`, a Redis outage makes every rate-limited endpoint (signup, login, OAuth2, refresh, logout, password reset, verify-account, `/auth/me`) return `429` for everyone — effectively a full authentication outage, not just degraded protection.

**Impact**: Redis becomes a single point of failure for the entire authentication surface, not just for caching/rate-limiting specifically.

**Why it exists**: A deliberate tradeoff (fail closed = safer default for rate limiting than silently disabling it), but the blast radius (every auth route, not just rate-limit-specific behavior) may be wider than intended.

**Possible fix**: Consider whether a Redis outage should degrade auth routes to "unlimited" (fail open) instead of "locked out" (fail closed) — a product/security tradeoff decision, not purely a code fix, so left for a deliberate follow-up rather than changed silently here.

**Priority**: Medium — depends entirely on the deployment's Redis availability guarantees.

### `send_email_task` failures are silent

**Description**: `taskiq_tasks/email_tasks.py::send_email_task` catches all exceptions, logs, and returns `False` — no retry policy, dead-letter queue, or alerting is configured on the Taskiq broker.

**Impact**: A transient SMTP failure (e.g. Gmail rate-limiting or a momentary outage) silently drops a verification or password-reset email with no automatic retry and no operator alert — the user just never receives it.

**Why it exists**: Out of scope for the original implementation; Taskiq supports retry policies but none is configured.

**Possible fix**: Add a Taskiq retry policy (`@broker.task(retry_on_error=True, max_retries=...)` or equivalent) and/or an alert on repeated failures.

**Priority**: Medium — user-facing (a real user can get stuck unable to verify/reset) but not a security issue.

## Configuration

### One global rate-limit threshold for every endpoint

**Description**: `MAX_REQUESTS_PER_WINDOW`/`REQUEST_WINDOW_SECONDS` is one shared setting applied identically to every `@rate_limited(...)` endpoint (signup, login, OAuth2, refresh, password reset, etc.) — there's no per-endpoint override.

**Impact**: A threshold tuned for, say, login (a frequently-hit route) may be too permissive or too strict for a rarer route like password-reset-request.

**Why it exists**: Simplicity — one setting to reason about; the login-specific brute-force lockout (`login_protection_service.py`) layers a second, endpoint-specific control on top for the one route that most needs it.

**Possible fix**: Extend `rate_limited(...)` to accept optional per-call overrides, defaulting to the global setting.

**Priority**: Low — the current layering (generic global limit + login-specific lockout) covers the highest-risk route already.

## Testing

### Frontend test coverage gaps

**Description**: No dedicated test exists for: `theme/`/`themeStore`, most of `components/ui/*` (`DataTable`, `ConfirmDialog`, `FormAlert`, `PasswordRulesChecklist`, `toaster`, `LoadingState`), `components/layout/Navbar.tsx`/`AppLayout.tsx`, `hooks/usePasswordPolicy`/`useUnsavedChangesWarning` in isolation, and `api/users_api.ts`/`policies_api.ts`/`audit_api.ts` (only `auth_api` has per-endpoint unit tests). See [Testing Overview](../testing/overview.md#known-coverage-gaps-not-filled-by-this-pass).

**Impact**: Regressions in these areas wouldn't be caught by the automated suite; they'd surface as manual QA/user-reported bugs instead.

**Why it exists**: Organic growth — new features got tests, shared low-level UI primitives didn't.

**Possible fix**: Incrementally add tests as these components are touched, or in a dedicated coverage-focused pass.

**Priority**: Low-medium — these are mostly presentational/low-logic components; the highest-risk gaps (auth, PBAC, profile flow, routing) were addressed in this pass.

### `send_email_task` has no dedicated test

**Description**: No unit test exercises the task function itself (its callers are tested with `.kiq()` mocked instead).

**Possible fix**: A unit test mocking `aiosmtplib.send` to verify both the success and failure paths return the expected bool and log appropriately.

**Priority**: Low.

### No coverage threshold gate in CI

**Description**: Neither `pytest.ini` (`--cov-fail-under`) nor `frontend/vitest.config.ts` enforce a minimum coverage percentage — `.github/workflows/ci.yml` runs the suites and generates reports but a coverage regression doesn't fail the build.

**Possible fix**: Add `--cov-fail-under=N` to `pytest.ini`'s `addopts` and a `coverage.thresholds` block to `vitest.config.ts`, once a baseline is established.

**Priority**: Low-medium.

### Performance tests not run in CI

**Description**: `tests/backend/performance/` exists but `.github/workflows/ci.yml`'s backend job only runs `unit`, `integration`, and `security`.

**Possible fix**: Add a fourth step, likely non-blocking (informational) rather than a hard gate, to avoid flaky-timing false failures on shared CI runners.

**Priority**: Low.

## CI/CD

### No dependency/security scanning

**Description**: Neither the Python (`backend/requirements.txt`) nor the Node (`frontend/package.json`) dependency tree is scanned for known vulnerabilities in CI — no `pip-audit`, `npm audit`, Dependabot, or Trivy step exists.

**Possible fix**: Add a `pip-audit`/`npm audit --audit-level=high` step, or enable GitHub's Dependabot alerts (config-only, no workflow change needed).

**Priority**: Medium.

### No deploy automation

**Description**: `docker-build` in CI verifies both Dockerfiles build but does not push to a registry or deploy anywhere.

**Why it exists**: Deliberate — this is a template repository with no assumed production target (see [Deployment Guide](../deployment/guide.md#free--low-cost-hosting-options) for provider-agnostic options); adding a deploy stage would need to assume a specific host.

**Priority**: N/A — intentional scope boundary, not a gap.

## Documentation debt resolved during this pass

Recorded here for traceability — these were found stale/incorrect during the audit and corrected as part of this same pass, not left for later:

- Root `README.md` described the system as RBAC with a "Role Hierarchy" and claimed Redux for state management — both wrong; the actual system is PBAC (role is display-only) and the frontend uses Zustand + TanStack Query. Fixed in the README rewrite.
- `docs/authorization/architecture.md` and `docs/security/decisions.md` described IP resolution as "never a header, always `request.client.host`" — the code has since grown `TRUSTED_PROXY_IPS`-gated `X-Forwarded-For` support (`core/client_ip.py`). Docs updated to match.
- `docs/database/design.md` referenced a nonexistent path (`backend/app/audit/models/security_audit_log_model.py`) — corrected to the real path (`backend/app/audit_log/security_audit_log_model.py`).
- `App.tsx`'s `NotFoundPage`/`NotAuthorizedPage` used `window.location.href = "/"` (full page reload) instead of router navigation — changed to `useNavigate()`.
- `core/settings.py` did not enforce a minimum `SECRET_KEY` length — now rejects anything under 32 characters at startup.
