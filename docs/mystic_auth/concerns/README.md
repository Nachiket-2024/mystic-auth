# Known Issues, Limitations & Technical Debt
---

Tracked deliberately rather than left as silent gaps. Each entry reflects an active, unresolved limitation in the current implementation: nothing speculative, and nothing already fixed (resolved items live in the relevant feature documentation instead).

---

## Security

---

### Database backups are scheduled, integrity-checked, and optionally shipped off-host, but there's still no point-in-time recovery or failure alerting

**Description**: `docker-compose.prod.yml` and every `docker-compose.local-prod-*.yml` variant run a `db_backup` service by default: a loop that calls `pg_dump --format=custom` on an interval (`BACKUP_INTERVAL_HOURS`), immediately verifies the dump with `pg_restore --list`, and writes it to `./backups` on the same host, deleting dumps older than `BACKUP_RETENTION_DAYS`. `scripts/mystic_auth/db/db_backup.sh` (manual/on-demand backups) does the same. An optional `BACKUP_UPLOAD_COMMAND` hook (blank by default) then runs after each verified dump with `DUMP_FILE` exported to it, so an operator can plug in `aws s3 cp`/`rclone copy`/`rsync`/etc. to ship the dump off-host without this template hardcoding a provider. This closes the original gaps ("no scheduler exists at all", "plain-text dumps with no verification", "single point of failure with no off-host path") but the mechanism still stops short of full production Postgres backup practice.

**Impact**: Two remaining gaps against a real production setup:
- **No point-in-time recovery**: this is periodic full dumps only, so worst-case data loss is up to `BACKUP_INTERVAL_HOURS` of writes, not "up to the last transaction" the way WAL-based continuous archiving gives you.
- **No active alerting**: a failed dump, failed `pg_restore --list` check, or failed `BACKUP_UPLOAD_COMMAND` is visible (`set -e` restarts the container) but only through container logs/`docker compose ps` someone has to be watching - there's no active paging.
- **`BACKUP_UPLOAD_COMMAND` is opt-in and unset by default**: a deployment that doesn't configure it still has dumps living only on the same host/disk as the database they're backing up.

**Why it's not fully fixed yet**: real PITR means integrating a dedicated tool (`pgBackRest`, `WAL-G`) for WAL archiving, which is more surface area than this loop was designed for - deliberately deferred rather than rushed. The off-host upload gap has a hook, but the template still assumes no specific cloud provider, so an operator has to supply the actual upload command (and, for S3-family targets, install `aws-cli`/`rclone` themselves - the `postgres:15` base image doesn't include one).

**Possible fix**: In order of effort - (1) ~~add an optional operator-supplied shell hook (`BACKUP_UPLOAD_COMMAND`) that runs after a successful dump~~ done; (2) wire a failure path into the Bugsink error-monitoring already in this stack, so a failed dump, failed verification, or failed upload pages someone instead of sitting in logs; (3) for real uptime/RPO requirements, replace the whole mechanism with `pgBackRest`/`WAL-G` or a managed Postgres provider's own backup feature instead of extending this loop further.

**Priority**: Low/Medium for a real production deployment - lower than before now that off-host shipping just needs one env var set, rather than a missing mechanism. Still Medium if PITR-level RPO actually matters for the data involved (this app stores password hashes, sessions, audit logs). Low/N/A for local development or a throwaway deployment.

---

## CI/CD

---

### No deploy automation

**Description**: `docker-build` in CI verifies that both Dockerfiles build but does not push to a registry or deploy anywhere.

**Why it exists**: This is a template repository with no assumed production target. See [Deployment Guide](../deployment/production-host.md). Adding a deploy stage would need to assume a specific host.

**Priority**: N/A, an intentional scope boundary, not a gap.

---

### Performance tests are non-blocking in CI

**Description**: The backend `performance` suite (`tests/backend/mystic_auth/performance`) runs in CI with `continue-on-error: true`, so a failure there is visible but never fails the build.

**Impact**: A genuine performance regression could land on `main` without CI stopping it. Only a human reviewing that job's result would catch it.

**Why it exists**: These tests assert generous regression-alarm thresholds against a real Postgres/Redis, so timing is inherently noisier than a correctness test on shared/loaded runners: a slow CI runner or concurrent load can trip a timing assertion with no actual code regression behind it (observed directly during this repo's own manual test runs).

**Possible fix**: Tighten the thresholds and/or the runner environment until false positives are rare enough to make the job blocking, or move to a dedicated, less noisy performance-testing environment instead of sharing CI's general-purpose runners.

**Priority**: Low. Correctness is still enforced elsewhere through blocking unit, integration, and security suites. This only affects how fast a real performance regression would be noticed.

---