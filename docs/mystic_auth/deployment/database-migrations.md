# Database Migrations
---

*New to a term here? See the [Infrastructure Glossary](../glossary/infrastructure.md).*

## Database migrations
---

The `alembic` service runs `alembic upgrade head` once and exits. In production-shaped Compose files, `backend` and `procrastinate_worker` wait for it with `condition: service_completed_successfully`, so request traffic does not start against an unmigrated schema.

Before applying a migration in production:

1. Review the migration file under `backend/alembic/versions/`.
2. Pay special attention to dropped columns, altered types, data migrations, role changes, and destructive SQL.
3. Confirm the migration has a downgrade only when rollback is actually safe.
4. Run the test suite or at least the migration check in a production-like database copy.

Migrations run with `DATABASE_URL`, normally the Postgres superuser. Runtime app traffic and Procrastinate task bodies prefer `APP_DATABASE_URL`, the least-privilege role created by migration. See [Security Decisions: Least-privilege app DB role](../security/decisions-infra.md#least-privilege-app-db-role-instead-of-running-as-postgres-superuser).

### Invalidating the authorization cache after an out-of-band write

A migration backfill, or a one-off `psql`/support script, that changes who holds which policy or permission bypasses the normal API-driven cache invalidation: affected users can see a stale authorization decision for up to 60 seconds (`_USER_POLICIES_TTL_SECONDS` in `authorization_cache_service.py`). Run this right after any such write:

```bash
# After an out-of-band UserPermission/UserPolicy change for specific users
python -m mystic_auth.scripts.invalidate_authorization_cache --email a@example.com --email b@example.com

# After editing a Policy's own definition (actions/resource_type/conditions),
# which can affect every holder, not just one
python -m mystic_auth.scripts.invalidate_authorization_cache --all-policies
```

An API-driven grant/revoke never needs this - it invalidates the cache itself already.

### PostgreSQL 15 to 18 data-volume upgrade

The Compose files now use PostgreSQL 18. PostgreSQL data directories are not
portable across major versions: do not start the PostgreSQL 18 image against a
volume initialized by PostgreSQL 15, and do not remove the old volume as part
of the upgrade. This is a dump-and-restore migration, separate from Alembic.

Before changing a deployment:

1. Keep the existing PostgreSQL 15 stack running and take encrypted dumps of
   both `POSTGRES_DB` and `bugsink` with the existing release's backup script.
2. Run the restore drill against that source stack and verify both dumps have
   matching HMAC sidecars. Copy the encrypted dumps and sidecars to storage
   that will remain available if the host fails.
3. Choose a new, unique Compose project name for the PostgreSQL 18 stack. A
   different project name gives it a new `postgres_data` volume while leaving
   the PostgreSQL 15 volume untouched.
4. Start only the new `postgres` service, restore the app and Bugsink dumps
   into it, and run the restore drill against the new project. Then start the
   complete new stack so its Alembic service applies any schema migrations.
5. Verify backend readiness, frontend behavior, worker health, and the
   deployment-specific smoke checks before directing traffic to the new
   stack. Keep the old Compose project, release configuration, and data
   volume until the new stack has passed acceptance.

For a production-mode candidate, substitute the selected mode's Compose file
and env-file suffix in these commands. The project-name override is inherited
by the helper scripts, so their `docker compose exec` calls target the new
PostgreSQL 18 service:

```bash
export COMPOSE_PROJECT_NAME=mystic-auth-pg18-candidate

docker compose \
  -f docker/mystic_auth/compose/docker-compose.prod.yml \
  -f docker/app/compose/docker-compose.prod.yml \
  --env-file env/mystic_auth/.env.prod \
  --env-file env/app/.env.prod \
  up -d postgres

scripts/mystic_auth/db/database-restore/database-restore.sh \
  backups/<app-database-dump>.dump.enc docker-compose.prod.yml --yes
scripts/mystic_auth/db/database-restore/database-restore.sh \
  backups/bugsink-<timestamp>.dump.enc docker-compose.prod.yml --yes
scripts/mystic_auth/db/database-restore/database-restore-drill.sh \
  docker-compose.prod.yml

docker compose \
  -f docker/mystic_auth/compose/docker-compose.prod.yml \
  -f docker/app/compose/docker-compose.prod.yml \
  --env-file env/mystic_auth/.env.prod \
  --env-file env/app/.env.prod \
  up -d
```

The examples use placeholders for the dump names. Keep the same
`BACKUP_ENCRYPTION_KEY` available to the restore helper that encrypted the
source dumps. Schedule a maintenance window: both stacks cannot serve the
same public ports at once, and the old application must stop writing before
the final source backup. Do not run `docker compose down -v` on the old
project. A rollback after the new database accepts writes needs a deliberate
data-reconciliation plan; simply switching back would discard those writes.

---
