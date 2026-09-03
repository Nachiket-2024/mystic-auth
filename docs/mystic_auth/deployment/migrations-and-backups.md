# Migrations and Backups
---
Deployment operations for Alembic migrations, database dumps, restore commands, and backup limitations.

---

## 1. Database migrations
---

The `alembic` service runs `alembic upgrade head` once and exits. In production-shaped Compose files, `backend` and `procrastinate_worker` wait for it with `condition: service_completed_successfully`, so request traffic does not start against an unmigrated schema.

Before applying a migration in production:

1. Review the migration file under `backend/alembic/versions/`.
2. Pay special attention to dropped columns, altered types, data migrations, role changes, and destructive SQL.
3. Confirm the migration has a downgrade only when rollback is actually safe.
4. Run the test suite or at least the migration check in a production-like database copy.

Migrations run with `DATABASE_URL`, normally the Postgres superuser. Runtime app traffic and Procrastinate task bodies prefer `APP_DATABASE_URL`, the least-privilege role created by migration. See [Security Decisions: Least-privilege app DB role](../security/decisions-infra.md#least-privilege-app-db-role-instead-of-running-as-postgres-superuser).

---

## 2. Backup scripts
---

`scripts/db/db_backup.sh` and `scripts/db/db_restore.sh` wrap Docker Compose, `pg_dump`, and `psql`.

```bash
# Dump the dev database and Bugsink database, if enabled
scripts/db/db_backup.sh

# Dump a production-shaped stack
scripts/db/db_backup.sh docker-compose.local-prod-ngrok.yml

# Restore a dump, with confirmation
scripts/db/db_restore.sh backups/mystic_auth-20260717-120000.sql

# Restore without confirmation
scripts/db/db_restore.sh -y backups/mystic_auth-20260717-120000.sql
```

The restore target is inferred from the dump filename. A `bugsink-*.sql` file restores into the `bugsink` database.

---

## 3. Scheduled backup sidecar
---

`docker-compose.prod.yml` and every `docker-compose.local-prod-*.yml` variant run a `db_backup` service by default.

| Setting | Purpose |
|---|---|
| `BACKUP_INTERVAL_HOURS` | Hours between scheduled dumps. |
| `BACKUP_RETENTION_DAYS` | Local retention window for old dump files. |
| `./backups` | Host directory where dumps are written. |

This is a periodic `pg_dump` loop. It is a baseline, not a production-grade backup system.

---

## 4. Backup limitations
---

Known limitations:

1. Dumps live on the same host by default.
2. There is no point-in-time recovery.
3. There is no automatic off-host upload.
4. There is no built-in restore verification.
5. There is no alert when scheduled backup fails.

For production data, copy backups off the host and periodically restore the latest dump into a scratch database. See [Known Issues](../concerns/README.md#database-backups-are-scheduled-but-not-production-grade).

---

## 5. Off-host copy without a cloud account
---

If there is no cloud account and no second server, use encrypted removable media as the minimum off-host path.

```bash
# One-time repository setup on mounted removable media
restic -r /mnt/usb-backup/mystic-auth init

# After each backup
restic -r /mnt/usb-backup/mystic-auth backup ./backups
restic -r /mnt/usb-backup/mystic-auth forget --keep-daily 14 --keep-weekly 8 --prune
```

Store the Restic password somewhere separate from the drive, such as a password manager. Disconnect the drive and keep it away from the host when possible.

When a second machine is available, use the same repository model over SFTP:

```bash
restic -r sftp:USER@REMOTE_HOST:/backups/mystic-auth init
restic -r sftp:USER@REMOTE_HOST:/backups/mystic-auth backup ./backups
```

Also keep a recoverable copy of the relevant env file, such as `env/.env.prod` or `env/.env.local-prod-ngrok`. A database dump without `SECRET_KEY`, database passwords, and provider secrets is not enough to recover the application.

---
