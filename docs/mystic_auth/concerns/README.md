# Known Issues, Limitations & Technical Debt
---

Tracked deliberately rather than left as silent gaps. Each entry reflects an active, unresolved limitation in the current implementation: nothing speculative, and nothing already fixed (resolved items live in the relevant feature documentation instead).

---

## Security

### Database backups are scheduled, but not production-grade

**Description**: `docker-compose.prod.yml` and `docker-compose.local-prod.yml` both run a `db_backup` service by default: a loop that calls `pg_dump` on an interval (`BACKUP_INTERVAL_HOURS`) and writes a plain-text `.sql` dump to `./backups` on the same host, deleting dumps older than `BACKUP_RETENTION_DAYS`. This closes the original gap ("no scheduler exists at all") but the mechanism itself stops well short of what real production Postgres backup practice looks like.

**Impact**: Three concrete gaps against a real production setup:
- **Single point of failure**: dumps live on the same host/disk as the database they're backing up. If that host or disk fails, the backups are gone too - nothing ships them off-host automatically.
- **No point-in-time recovery**: this is periodic full dumps only, so worst-case data loss is up to `BACKUP_INTERVAL_HOURS` of writes, not "up to the last transaction" the way WAL-based continuous archiving gives you.
- **No failure alerting or dump verification**: a silently-failing backup (disk full, `pg_dump` erroring) only shows up in container logs someone has to be watching; the dump is never restore-tested, so a truncated/corrupt file wouldn't be caught until an actual restore is attempted.

**Why it's not fixed yet**: doing this properly means either integrating a real tool (`pgBackRest`, `WAL-G`) for WAL archiving + PITR, or adding an off-host upload step - and that step has to stay cloud-agnostic (no specific S3/GCS/host assumed by this template, same reasoning as "No deploy automation" below), which is more surface area than a straightforward fix. Deliberately deferred rather than rushed.

**Possible fix**: In order of effort - (1) switch `pg_dump` to `--format=custom` (compressed, faster, restore-testable via `pg_restore --list` right after the dump) and add that integrity check to the loop; (2) add an optional operator-supplied shell hook (e.g. `BACKUP_UPLOAD_COMMAND`) that runs after a successful dump, so `aws s3 cp`/`rclone copy`/`rsync` can ship it off-host without this template hardcoding a provider; (3) wire a failure path into the Bugsink error-monitoring already in this stack, so a failed dump pages someone instead of sitting in logs; (4) for real uptime/RPO requirements, replace the whole mechanism with `pgBackRest`/`WAL-G` or a managed Postgres provider's own backup feature instead of extending this loop further.

**Priority**: Medium-High for any real production deployment holding data you can't afford to lose (this app stores password hashes, sessions, audit logs). Low/N/A for local development or a throwaway deployment.

---

## Configuration

### One global rate-limit threshold for every endpoint

**Description**: `MAX_REQUESTS_PER_WINDOW`/`REQUEST_WINDOW_SECONDS` is one shared setting applied identically to every `@rate_limited(...)` endpoint, including signup, login, OAuth2, and password reset. `/auth/refresh/` is not rate-limited by this mechanism. There is no per-endpoint override.

**Impact**: A threshold tuned for, say, login (a frequently-hit route) may be too permissive or too strict for a rarer route like password-reset-request.

**Why it exists**: Simplicity: one setting to reason about. The login-specific brute-force lockout (`login_protection_service.py`) layers a second, endpoint-specific control on top for the one route that most needs it.

**Possible fix**: Extend `rate_limited(...)` to accept optional per-call overrides, defaulting to the global setting.

**Priority**: Low, since the current layering (generic global limit + login-specific lockout) covers the highest-risk route already.

---

## CI/CD

### No deploy automation

**Description**: `docker-build` in CI verifies that both Dockerfiles build but does not push to a registry or deploy anywhere.

**Why it exists**: This is a template repository with no assumed production target. See [Deployment Guide](../deployment/guide.md#production-host-requirements). Adding a deploy stage would need to assume a specific host.

**Priority**: N/A, an intentional scope boundary, not a gap.

---

### Performance tests are non-blocking in CI

**Description**: The backend `performance` suite (`tests/backend/mystic_auth/performance`) runs in CI with `continue-on-error: true`, so a failure there is visible but never fails the build.

**Impact**: A genuine performance regression could land on `main` without CI stopping it. Only a human reviewing that job's result would catch it.

**Why it exists**: These tests assert generous regression-alarm thresholds against a real Postgres/Redis, so timing is inherently noisier than a correctness test on shared/loaded runners: a slow CI runner or concurrent load can trip a timing assertion with no actual code regression behind it (observed directly during this repo's own manual test runs).

**Possible fix**: Tighten the thresholds and/or the runner environment until false positives are rare enough to make the job blocking, or move to a dedicated, less noisy performance-testing environment instead of sharing CI's general-purpose runners.

**Priority**: Low. Correctness is still enforced elsewhere through blocking unit, integration, and security suites. This only affects how fast a real performance regression would be noticed.

---