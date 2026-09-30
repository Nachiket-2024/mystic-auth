FROM postgres:15@sha256:724292da1f2e50bdccfc3302ce75bbba7f4a6076701b588cc795fcac65683550

# The scheduled backup service needs both the B2 client and
# curl for the Sentry-compatible Bugsink failure notification. Keep the
# database client image as the base so pg_dump/pg_restore stay version-matched
# with the server image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates rclone curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 mysticbackup \
    && useradd --system --uid 10001 --gid 10001 --home-dir /nonexistent \
       --no-create-home --shell /usr/sbin/nologin mysticbackup

COPY scripts/mystic_auth/db/backup_failure_alert.sh /usr/local/bin/backup-failure-alert
COPY scripts/mystic_auth/db/run_backup_upload.sh /usr/local/bin/run-backup-upload
RUN chmod 0755 /usr/local/bin/backup-failure-alert /usr/local/bin/run-backup-upload

COPY docker/mystic_auth/dockerfiles/db-backup-entrypoint.sh /usr/local/bin/db-backup-entrypoint
RUN chmod 0755 /usr/local/bin/db-backup-entrypoint

# The production image is non-root by default. Compose services with a
# bind-mounted backup directory explicitly start the entrypoint as root so it
# can normalize that mount's ownership, then it drops to UID/GID 10001.
USER mysticbackup

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pg_isready -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" || exit 1
