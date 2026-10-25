#!/usr/bin/env bash
# Regression test for scripts/mystic_auth/db/database-restore/database-restore-drill.sh. Needs a
# running `postgres` service (the dev Compose stack, already up in CI's
# docker-build job before this runs) - unlike the env-tools regression
# suite, this genuinely needs a live database, not a throwaway temp dir.
#
# Covers the real bug found building the drill itself: pg_dump --file=-
# silently wrote a 0-byte dump on this image's pg_dump build instead of
# writing to stdout, and database-backup.sh used exactly that pattern. Both
# scripts now omit --file and rely on stdout redirection instead - see
# their own comments at the fixed line.
#
# Usage (from repo root, dev stack's postgres already up):
#   tests/scripts/mystic_auth/db/test-restore-drill.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

echo "=== database-restore-drill.sh succeeds against a real running database ==="
if DRILL_OUTPUT="$(bash scripts/mystic_auth/db/database-restore/database-restore-drill.sh docker-compose.dev.yml 2>&1)"; then
  printf '%s\n' "$DRILL_OUTPUT"
  pass "drill exits 0 and reports a clean restore"
else
  printf '%s\n' "$DRILL_OUTPUT" >&2
  fail "drill failed against a database it should be able to dump and restore"
fi

echo
echo "=== a corrupt dump is caught, not silently accepted ==="
DC_ARGS=(-f docker/mystic_auth/compose/docker-compose.dev.yml -f docker/app/compose/docker-compose.dev.yml \
  --env-file env/mystic_auth/.env.dev --env-file env/app/.env.dev)
POSTGRES_USER="${POSTGRES_USER:-$(grep -hm1 '^POSTGRES_USER=' env/app/.env.dev env/mystic_auth/.env.dev 2>/dev/null | head -n1 | cut -d= -f2-)}"
: "${POSTGRES_USER:?POSTGRES_USER must be set in env/app/.env.dev or env/mystic_auth/.env.dev}"
POSTGRES_DB="${POSTGRES_DB:-$(grep -hm1 '^POSTGRES_DB=' env/app/.env.dev env/mystic_auth/.env.dev 2>/dev/null | head -n1 | cut -d= -f2-)}"
: "${POSTGRES_DB:?POSTGRES_DB must be set in env/app/.env.dev or env/mystic_auth/.env.dev}"
# Deliberately truncated input, the same failure shape the real --file=-
# bug produced (a 0-byte/too-short file), fed straight to pg_restore
# without going through the drill script (which always dumps a real,
# valid database) - proving pg_restore itself, and therefore the drill's
# own step 3, does not silently accept broken input.
if echo -n "" | docker compose "${DC_ARGS[@]}" exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "SELECT 1;" >/dev/null 2>&1; then
  : # sanity: postgres is reachable at all before trusting the negative test below
else
  fail "postgres service is not reachable - is the dev stack up?"
fi
if echo -n "" | docker compose "${DC_ARGS[@]}" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" --dbname postgres 2>/dev/null; then
  fail "pg_restore accepted an empty/corrupt dump instead of erroring"
else
  pass "pg_restore correctly rejects a corrupt/truncated dump"
fi

echo
echo "=== both databases were restored and their scratch copies were cleaned up ==="
grep -q "OK: '${POSTGRES_DB}' restored with the same public tables and row counts" <<< "$DRILL_OUTPUT" \
  || fail "application database restore parity was not reported"
if grep -q "OK: 'bugsink' restored with the same public tables and row counts" <<< "$DRILL_OUTPUT"; then
  pass "populated Bugsink database restore parity was reported"
elif grep -q "OK: 'bugsink' restored as an empty database" <<< "$DRILL_OUTPUT"; then
  pass "empty dev Bugsink database was restored as empty"
else
  fail "Bugsink database restore parity was not reported"
fi
mapfile -t SCRATCH_DATABASES < <(printf '%s\n' "$DRILL_OUTPUT" | sed -n "s/.*Creating scratch database '\([^']*\)'.*/\1/p")
[ "${#SCRATCH_DATABASES[@]}" -eq 2 ] || fail "drill did not report both scratch database names"
for scratch_db in "${SCRATCH_DATABASES[@]}"; do
  SCRATCH_EXISTS="$(docker compose "${DC_ARGS[@]}" exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${scratch_db}';")"
  if [ -z "$(echo "$SCRATCH_EXISTS" | tr -d '[:space:]')" ]; then
    pass "scratch database ${scratch_db} was cleaned up"
  else
    fail "scratch database '${scratch_db}' still exists after the drill - cleanup trap did not run"
  fi
done

echo
echo "All restore-drill checks passed."
