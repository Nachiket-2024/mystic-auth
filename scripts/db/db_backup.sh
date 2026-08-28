#!/usr/bin/env bash
# Dumps the `postgres` Compose service's database to a timestamped .sql
# file under backups/. Reads POSTGRES_USER/POSTGRES_DB from the env file
# matching the given compose file.
#
# Usage: scripts/db/db_backup.sh [compose-file]
#   compose-file defaults to docker-compose.yml.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="${1:-docker-compose.yml}"

case "$COMPOSE_FILE" in
  docker-compose.local-prod.yml) ENV_FILE=".env.local-prod" ;;
  docker-compose.prod.yml) ENV_FILE=".env.prod" ;;
  *) ENV_FILE=".env" ;;
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
BACKUP_FILE="$BACKUP_DIR/${POSTGRES_DB}-${TIMESTAMP}.sql"

echo "Backing up database '${POSTGRES_DB}' via ${COMPOSE_FILE}..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE"

echo "Backup written to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
