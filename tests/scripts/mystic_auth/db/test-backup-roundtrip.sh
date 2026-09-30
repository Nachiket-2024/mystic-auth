#!/usr/bin/env bash
# Exercise the real encrypted manual-backup path against the CI database.
# This deliberately uses a temporary host directory so the test never depends
# on bind-mount ownership or writes into the repository's backup archive.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

BACKUP_DIR_TEST="$(mktemp -d)"
trap 'rm -rf -- "$BACKUP_DIR_TEST"' EXIT
COMPOSE_FILE="${BACKUP_TEST_COMPOSE_FILE:-docker-compose.dev.yml}"

echo "=== create and structurally verify encrypted backups ==="
# The disposable check must also work against an older local .env.dev that
# predates encrypted backups. Never write this generated key back to env files.
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-$(openssl rand -hex 32)}" \
  BACKUP_DIR="$BACKUP_DIR_TEST" BACKUP_UPLOAD_COMMAND= \
  bash scripts/mystic_auth/db/db_backup.sh "$COMPOSE_FILE"

for database in mystic_auth bugsink; do
  files=("$BACKUP_DIR_TEST/$database-"*.dump.enc)
  if [ "${#files[@]}" -ne 1 ] || [ ! -s "${files[0]}" ]; then
    echo "FAIL: expected one non-empty encrypted backup for '$database'" >&2
    exit 1
  fi
  if grep -a -q 'PGDMP' "${files[0]}"; then
    echo "FAIL: '$database' backup appears to contain plaintext custom-format data" >&2
    exit 1
  fi
done
echo "OK: both databases produced non-empty encrypted dumps"

echo "=== verify freshness monitoring against the generated artifacts ==="
BACKUP_DATABASES="mystic_auth bugsink" \
  bash scripts/mystic_auth/db/check_backup_freshness.sh "$BACKUP_DIR_TEST" 1

echo "All encrypted backup round-trip checks passed."
