#!/usr/bin/env bash
# Dumps the `postgres` Compose service's app database and its bugsink
# database (error monitoring, see docker/mystic_auth/postgres-init/init-bugsink-db.sh)
# to timestamped .dump files under backups/. Reads POSTGRES_USER/POSTGRES_DB
# from the env file matching the given compose file.
#
# Usage: scripts/mystic_auth/db/db_backup.sh [compose-file]
#   compose-file defaults to docker-compose.dev.yml, and can be given as
#   just a basename (looked up under docker/mystic_auth/compose/) or a full
#   path.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_ARG="${1:-docker-compose.dev.yml}"
COMPOSE_BASENAME="$(basename "$COMPOSE_ARG")"
case "$COMPOSE_ARG" in
  */*) COMPOSE_FILES=("$COMPOSE_ARG") ;;
  *) COMPOSE_FILES=("docker/mystic_auth/compose/$COMPOSE_BASENAME" "docker/app/compose/$COMPOSE_BASENAME") ;;
esac

# Derived from the filename rather than a fixed list, so a fork's own new
# mode (e.g. docker-compose.staging.yml) resolves to the right env file
# too: "dev" is the one mode with no suffix by convention, every other
# mode's suffix is ".<mode>".
MODE="${COMPOSE_BASENAME#docker-compose.}"
MODE="${MODE%.yml}"
if [ "$MODE" = "dev" ]; then
  ENV_SUFFIX=""
else
  ENV_SUFFIX=".${MODE}"
fi
ENV_FILE="env/mystic_auth/.env${ENV_SUFFIX}"
APP_ENV_FILE="env/app/.env${ENV_SUFFIX}"
ENV_FILES=("$ENV_FILE" "$APP_ENV_FILE")

# Pull just these two vars by name rather than sourcing the whole file:
# some values (e.g. GMAIL_APP_PASSWORD) have unquoted spaces that break
# `source` but are fine for python-dotenv/pydantic. Checked in app/ then
# mystic_auth/ so a fork's override wins.
if [ -z "${POSTGRES_USER:-}" ]; then
  POSTGRES_USER="$(grep -hm1 '^POSTGRES_USER=' "$APP_ENV_FILE" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2-)"
fi
if [ -z "${POSTGRES_DB:-}" ]; then
  POSTGRES_DB="$(grep -hm1 '^POSTGRES_DB=' "$APP_ENV_FILE" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2-)"
fi

: "${POSTGRES_USER:?POSTGRES_USER must be set (check $ENV_FILE)}"
: "${POSTGRES_DB:?POSTGRES_DB must be set (check $ENV_FILE)}"

DC_ARGS=()
for f in "${COMPOSE_FILES[@]}"; do DC_ARGS+=(-f "$f"); done
for f in "${ENV_FILES[@]}"; do DC_ARGS+=(--env-file "$f"); done

BACKUP_DIR="$REPO_ROOT/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

for DB in "$POSTGRES_DB" bugsink; do
  BACKUP_FILE="$BACKUP_DIR/${DB}-${TIMESTAMP}.dump"
  echo "Backing up database '${DB}' via ${COMPOSE_FILES[*]}..."
  # No --file=-: on this image's pg_dump build, "-" as a literal filename
  # argument produces a 0-byte file instead of writing to stdout (a real
  # bug caught building the restore-drill test, see
  # scripts/mystic_auth/db/db_restore_drill.sh). Omitting --file entirely
  # defaults to stdout, which this redirect already captures, and works
  # portably regardless of that behavior.
  docker compose "${DC_ARGS[@]}" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" --format=custom "$DB" > "$BACKUP_FILE"
  docker compose "${DC_ARGS[@]}" exec -T postgres \
    pg_restore --list < "$BACKUP_FILE" >/dev/null
  echo "Backup written to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

  # Same optional off-host upload hook as the db_backup Compose service
  # (docker-compose.prod.yml and the local-prod-* variants), so a manual
  # backup ships off-host the same way a scheduled one does.
  if [ -n "${BACKUP_UPLOAD_COMMAND:-}" ]; then
    echo "Running BACKUP_UPLOAD_COMMAND for $BACKUP_FILE..."
    DUMP_FILE="$BACKUP_FILE" sh -c "$BACKUP_UPLOAD_COMMAND"
  fi
done
