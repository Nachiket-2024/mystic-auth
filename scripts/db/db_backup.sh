#!/usr/bin/env bash
# Dumps the `postgres` Compose service's app database and its bugsink
# database (error monitoring, see docker/postgres-init/init-bugsink-db.sh)
# to timestamped .dump files under backups/. Reads POSTGRES_USER/POSTGRES_DB
# from the env file matching the given compose file.
#
# Usage: scripts/db/db_backup.sh [compose-file]
#   compose-file defaults to docker-compose.dev.yml, and can be given as
#   just a basename (looked up under docker/compose/) or a full path.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_ARG="${1:-docker-compose.dev.yml}"
COMPOSE_BASENAME="$(basename "$COMPOSE_ARG")"
case "$COMPOSE_ARG" in
  */*) COMPOSE_FILE="$COMPOSE_ARG" ;;
  *) COMPOSE_FILE="docker/compose/$COMPOSE_BASENAME" ;;
esac

case "$COMPOSE_BASENAME" in
  docker-compose.local-prod-cloudflare.yml) ENV_FILE="env/.env.local-prod-cloudflare" ;;
  docker-compose.local-prod-ngrok.yml) ENV_FILE="env/.env.local-prod-ngrok" ;;
  docker-compose.local-prod-tailscale.yml) ENV_FILE="env/.env.local-prod-tailscale" ;;
  docker-compose.prod.yml) ENV_FILE="env/.env.prod" ;;
  *) ENV_FILE="env/.env" ;;
esac

# Pull just these two vars by name rather than sourcing the whole file:
# some values (e.g. GMAIL_APP_PASSWORD) have unquoted spaces that break
# `source` but are fine for python-dotenv/pydantic.
if [ -z "${POSTGRES_USER:-}" ] && [ -f "$ENV_FILE" ]; then
  POSTGRES_USER="$(grep -m1 '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2-)"
fi
if [ -z "${POSTGRES_DB:-}" ] && [ -f "$ENV_FILE" ]; then
  POSTGRES_DB="$(grep -m1 '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2-)"
fi

: "${POSTGRES_USER:?POSTGRES_USER must be set (check $ENV_FILE)}"
: "${POSTGRES_DB:?POSTGRES_DB must be set (check $ENV_FILE)}"

BACKUP_DIR="$REPO_ROOT/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

for DB in "$POSTGRES_DB" bugsink; do
  BACKUP_FILE="$BACKUP_DIR/${DB}-${TIMESTAMP}.dump"
  echo "Backing up database '${DB}' via ${COMPOSE_FILE}..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" --format=custom --file=- "$DB" > "$BACKUP_FILE"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
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
