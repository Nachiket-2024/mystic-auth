FROM postgres:15

# The scheduled backup service needs both the B2 client and
# curl for the Sentry-compatible Bugsink failure notification. Keep the
# database client image as the base so pg_dump/pg_restore stay version-matched
# with the server image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates rclone curl \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/mystic_auth/db/backup_failure_alert.sh /usr/local/bin/backup-failure-alert
COPY scripts/mystic_auth/db/run_backup_upload.sh /usr/local/bin/run-backup-upload
RUN chmod 0755 /usr/local/bin/backup-failure-alert /usr/local/bin/run-backup-upload
