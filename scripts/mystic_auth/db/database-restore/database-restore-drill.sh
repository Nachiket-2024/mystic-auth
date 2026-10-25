#!/usr/bin/env bash
# Proves the app and Bugsink databases are actually restorable, not just
# present: encrypts and authenticates each dump, restores each into a
# disposable scratch database on the same Postgres server, checks schema and
# row-count parity, then drops the scratch databases. Exits non-zero on any failure, so
# a broken backup or restore path fails loudly instead of only being
# discovered during a real incident.
#
# database-backup.sh verifies dump structure with `pg_restore --list`; this
# also proves both dumps' contents come back as queryable databases.
#
# Usage: scripts/mystic_auth/db/database-restore/database-restore-drill.sh [compose-file]
#   compose-file defaults to docker-compose.dev.yml, and can be given as
#   just a basename (looked up under docker/mystic_auth/compose/) or a full
#   path. Needs a running `postgres` service on that compose file.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"
cd "$REPO_ROOT"

COMPOSE_ARG="${1:-docker-compose.dev.yml}"
COMPOSE_BASENAME="$(basename "$COMPOSE_ARG")"
case "$COMPOSE_ARG" in
  */*) COMPOSE_FILES=("$COMPOSE_ARG") ;;
  *) COMPOSE_FILES=("docker/mystic_auth/compose/$COMPOSE_BASENAME" "docker/app/compose/$COMPOSE_BASENAME") ;;
esac

# Same env-file resolution as database-backup.sh/database-restore.sh - see their own
# comments for why this is done by name, not `source`.
MODE="${COMPOSE_BASENAME#docker-compose.}"
MODE="${MODE%.yml}"
if [ "$MODE" = "dev" ]; then
  ENV_SUFFIX=".dev"
else
  ENV_SUFFIX=".${MODE}"
fi
ENV_FILE="env/mystic_auth/.env${ENV_SUFFIX}"
APP_ENV_FILE="env/app/.env${ENV_SUFFIX}"
ENV_FILES=("$ENV_FILE" "$APP_ENV_FILE")

if [ -z "${POSTGRES_USER:-}" ]; then
  POSTGRES_USER="$(grep -hm1 '^POSTGRES_USER=' "$APP_ENV_FILE" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2-)"
fi
if [ -z "${POSTGRES_DB:-}" ]; then
  POSTGRES_DB="$(grep -hm1 '^POSTGRES_DB=' "$APP_ENV_FILE" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2-)"
fi
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  BACKUP_ENCRYPTION_KEY="$(grep -hm1 '^BACKUP_ENCRYPTION_KEY=' "$APP_ENV_FILE" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2-)"
  export BACKUP_ENCRYPTION_KEY
fi

: "${POSTGRES_USER:?POSTGRES_USER must be set (check $ENV_FILE)}"
: "${POSTGRES_DB:?POSTGRES_DB must be set (check $ENV_FILE)}"

DC_ARGS=()
for f in "${COMPOSE_FILES[@]}"; do DC_ARGS+=(-f "$f"); done
for f in "${ENV_FILES[@]}"; do DC_ARGS+=(--env-file "$f"); done

# Both databases are included in database-backup.sh. A disposable restore of
# each proves the data can be decrypted, authenticated, and loaded, not only
# that the custom-format dump header can be listed.
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY must be set for encrypted restore drills}"
DRILL_DATABASES=("$POSTGRES_DB")
if [ "$POSTGRES_DB" != bugsink ]; then
  DRILL_DATABASES+=(bugsink)
fi
SCRATCH_DATABASES=()
DRILL_DUMPS=()

cleanup() {
  local dump scratch
  for dump in "${DRILL_DUMPS[@]}"; do
    rm -f "$dump" "$dump.hmac"
  done
  for scratch in "${SCRATCH_DATABASES[@]}"; do
    docker compose "${DC_ARGS[@]}" exec -T postgres \
      psql -U "$POSTGRES_USER" -d postgres \
      -c "DROP DATABASE \"${scratch}\";" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

for SOURCE_DB in "${DRILL_DATABASES[@]}"; do
  # Generated names permit concurrent drills and ensure cleanup never drops a
  # database that existed before this process created its own scratch copy.
  SCRATCH_DB="restore_drill_${$}_${RANDOM}"
  DRILL_DUMP="$(mktemp --suffix=.dump.enc)"
  DRILL_DUMPS+=("$DRILL_DUMP")

  echo "1/5  Dumping '${SOURCE_DB}'..."
  # Omit --file=-: on this pg_dump build, that writes a 0-byte file instead
  # of stdout. With no --file argument, stdout is captured by this pipeline.
  docker compose "${DC_ARGS[@]}" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" --format=custom "$SOURCE_DB" | \
    openssl enc -aes-256-cbc -pbkdf2 -salt -out "$DRILL_DUMP" \
      -pass env:BACKUP_ENCRYPTION_KEY

  "$REPO_ROOT/scripts/mystic_auth/db/backup-verification/backup-hmac.sh" \
    tag "$DRILL_DUMP" "$BACKUP_ENCRYPTION_KEY"
  "$REPO_ROOT/scripts/mystic_auth/db/backup-verification/backup-hmac.sh" \
    verify "$DRILL_DUMP" "$BACKUP_ENCRYPTION_KEY"

  echo "2/5  Creating scratch database '${SCRATCH_DB}'..."
  docker compose "${DC_ARGS[@]}" exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ${SCRATCH_DB};" >/dev/null
  SCRATCH_DATABASES+=("$SCRATCH_DB")

  echo "3/5  Restoring the verified dump into '${SCRATCH_DB}'..."
  docker compose "${DC_ARGS[@]}" exec -T postgres \
    pg_restore -U "$POSTGRES_USER" --dbname "$SCRATCH_DB" < <(openssl enc -d \
      -aes-256-cbc -pbkdf2 -in "$DRILL_DUMP" -pass env:BACKUP_ENCRYPTION_KEY)

  echo "4/5  Smoke-checking the restored '${SOURCE_DB}' database..."
  if [ "$SOURCE_DB" = "$POSTGRES_DB" ]; then
    # These application-specific objects prove the migrated schema came back.
    ALEMBIC_ROWS="$(docker compose "${DC_ARGS[@]}" exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$SCRATCH_DB" -tAc "SELECT count(*) FROM alembic_version;")"
    if [ "$(echo "$ALEMBIC_ROWS" | tr -d '[:space:]')" -lt 1 ]; then
      echo "FAIL: alembic_version has no rows in the restored '${SOURCE_DB}' database." >&2
      exit 1
    fi
    USERS_TABLE_EXISTS="$(docker compose "${DC_ARGS[@]}" exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$SCRATCH_DB" -tAc "SELECT to_regclass('public.users') IS NOT NULL;")"
    if [ "$(echo "$USERS_TABLE_EXISTS" | tr -d '[:space:]')" != "t" ]; then
      echo "FAIL: users table missing in the restored '${SOURCE_DB}' database." >&2
      exit 1
    fi
  fi

  echo "5/5  Comparing public table names and row counts for '${SOURCE_DB}'..."
  SOURCE_TABLES="$(docker compose "${DC_ARGS[@]}" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$SOURCE_DB" -tAc \
    "SELECT quote_ident(tablename) FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" | tr -d '\r')"
  RESTORED_TABLES="$(docker compose "${DC_ARGS[@]}" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$SCRATCH_DB" -tAc \
    "SELECT quote_ident(tablename) FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" | tr -d '\r')"
  if [ "$SOURCE_DB" = bugsink ] && [ -z "$SOURCE_TABLES" ] && [ -z "$RESTORED_TABLES" ]; then
    # The disposable dev stack intentionally does not start Bugsink, so its
    # separately-created database can be empty. A matching empty dump is
    # still a valid restore; populated deployment databases take the normal
    # table-name and row-count path below.
    echo "OK: 'bugsink' restored as an empty database."
    continue
  fi
  if [ -z "$SOURCE_TABLES" ] || [ "$SOURCE_TABLES" != "$RESTORED_TABLES" ]; then
    echo "FAIL: public table names differ between '${SOURCE_DB}' and its restored copy." >&2
    exit 1
  fi

  while IFS= read -r TABLE; do
    [ -z "$TABLE" ] && continue
    SOURCE_COUNT="$(docker compose "${DC_ARGS[@]}" exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$SOURCE_DB" -tAc "SELECT count(*) FROM ${TABLE};" | tr -d '[:space:]')"
    RESTORED_COUNT="$(docker compose "${DC_ARGS[@]}" exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$SCRATCH_DB" -tAc "SELECT count(*) FROM ${TABLE};" | tr -d '[:space:]')"
    if [ "$SOURCE_COUNT" != "$RESTORED_COUNT" ]; then
      echo "FAIL: table '${TABLE}' has ${SOURCE_COUNT} rows in '${SOURCE_DB}' but ${RESTORED_COUNT} in the restored copy." >&2
      exit 1
    fi
  done <<< "$SOURCE_TABLES"

  echo "OK: '${SOURCE_DB}' restored with the same public tables and row counts."
done
