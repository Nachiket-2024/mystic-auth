#!/usr/bin/env bash
# Restores a .dump or legacy .sql backup into the `postgres`
# Docker Compose service. This is destructive because it overwrites rows and
# tables defined by the dump, so it asks for confirmation unless -y/--yes is passed.
# The target database is taken from the dump's filename (<db>-<timestamp>.dump,
# e.g. "bugsink-20260901-020000.dump" restores into "bugsink"), falling back to
# POSTGRES_DB for files that don't follow that naming convention.
#
# Usage: scripts/db/db_restore.sh <backup-file> [compose-file] [-y|--yes]
#   compose-file defaults to docker-compose.dev.yml, and can be given as
#   just a basename (looked up under docker/compose/) or a full path.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

BACKUP_FILE=""
COMPOSE_ARG="docker-compose.dev.yml"
ASSUME_YES=false

for arg in "$@"; do
  case "$arg" in
    -y|--yes)
      ASSUME_YES=true
      ;;
    *.yml|*.yaml)
      COMPOSE_ARG="$arg"
      ;;
    *)
      BACKUP_FILE="$arg"
      ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: scripts/db/db_restore.sh <backup-file> [compose-file] [-y|--yes]" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

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

# Derive the target database from the dump's own filename so a
# "bugsink-*.dump" or legacy "bugsink-*.sql" restores into "bugsink" rather than always landing
# in POSTGRES_DB. Falls back to POSTGRES_DB for non-conforming filenames.
BASENAME="$(basename "$BACKUP_FILE")"
if [[ "$BASENAME" =~ ^(.+)-[0-9]{8}-[0-9]{6}\.(dump|sql)$ ]]; then
  TARGET_DB="${BASH_REMATCH[1]}"
else
  TARGET_DB="$POSTGRES_DB"
fi

if [ "$ASSUME_YES" != true ]; then
  read -r -p "This will overwrite data in database '${TARGET_DB}' with the contents of ${BACKUP_FILE}. Continue? [y/N] " reply
  case "$reply" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

echo "Restoring '${TARGET_DB}' from ${BACKUP_FILE} via ${COMPOSE_FILE}..."
case "$BACKUP_FILE" in
  *.dump)
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
      pg_restore -U "$POSTGRES_USER" --clean --if-exists --dbname "$TARGET_DB" < "$BACKUP_FILE"
    ;;
  *)
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
      psql -U "$POSTGRES_USER" "$TARGET_DB" < "$BACKUP_FILE"
    ;;
esac

echo "Restore complete."
