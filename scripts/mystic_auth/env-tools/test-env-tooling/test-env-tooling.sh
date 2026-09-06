#!/usr/bin/env bash
# Regression test for the env-file tooling (setup-env, check-env,
# rotate-secrets, set-env-field, copy-env-values), run against a throwaway
# copy of the repo's env/ and frontend/ trees under a temp dir. Never
# touches this repo's own real env files. Run manually after touching any
# of those scripts:
#   scripts/env-tools/test-env-tooling/test-env-tooling.sh
#
# Covers the real bug found manually during development: setup-env's and
# rotate-secrets' shared sed_inplace helper used to delete a caller's own
# env/.env.bak by colliding with sed -i.bak's own transient backup file.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
BASE="$(mktemp -d)"
trap 'rm -rf "$BASE"' EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

# Fresh copy of just what these scripts touch: the .example files, the
# scripts themselves (so relative script-to-repo-root paths still resolve
# the same way), and an empty frontend/ dir for frontend/.env.
mkdir -p "$BASE/env" "$BASE/frontend" "$BASE/scripts/env-tools"
cp "$REPO_ROOT"/env/.env*.example "$BASE/env/"
cp "$REPO_ROOT"/frontend/.env.example "$BASE/frontend/"
cp -r "$REPO_ROOT"/scripts/env-tools/setup-env "$REPO_ROOT"/scripts/env-tools/check-env \
      "$REPO_ROOT"/scripts/env-tools/rotate-secrets "$REPO_ROOT"/scripts/env-tools/set-env-field \
      "$REPO_ROOT"/scripts/env-tools/copy-env-values "$BASE/scripts/env-tools/"
chmod +x "$BASE"/scripts/env-tools/*/*.sh
cd "$BASE"

echo "=== setup-env: bootstraps every file, skips none that don't exist yet ==="
printf 'TestApp\n#123456\n' | scripts/env-tools/setup-env/setup-env.sh >/dev/null
for f in env/.env env/.env.prod env/.env.local-prod-cloudflare env/.env.local-prod-ngrok env/.env.local-prod-tailscale frontend/.env; do
  [ -f "$f" ] || fail "setup-env: $f was not created"
done
pass "setup-env: created every expected file"

DEV_SECRET_1="$(grep '^SECRET_KEY=' env/.env | cut -d= -f2)"
PROD_SECRET="$(grep '^SECRET_KEY=' env/.env.prod | cut -d= -f2)"
[ "$DEV_SECRET_1" != "$PROD_SECRET" ] || fail "setup-env: SECRET_KEY reused across files"
pass "setup-env: SECRET_KEY is distinct per file"

PG_PW="$(grep '^POSTGRES_PASSWORD=' env/.env | cut -d= -f2)"
grep -q "postgres:${PG_PW}@" <(grep '^DATABASE_URL=' env/.env) || fail "setup-env: DATABASE_URL password out of sync with POSTGRES_PASSWORD"
pass "setup-env: DATABASE_URL password matches generated POSTGRES_PASSWORD"

echo "=== setup-env: never overwrites an existing file ==="
BEFORE_DEV_FILE="$(cat env/.env)"
printf '\n\n' | scripts/env-tools/setup-env/setup-env.sh >/dev/null
[ "$(cat env/.env)" = "$BEFORE_DEV_FILE" ] || fail "setup-env: overwrote an existing file"
pass "setup-env: left an existing file untouched"

# Regression test for the sed -i.bak / env/.env.bak collision bug.
cp env/.env.local-prod-cloudflare.example env/.env.local-prod-cloudflare.bak
echo "CANARY=should-survive" >> env/.env.local-prod-cloudflare.bak
rm env/.env.local-prod-cloudflare
printf '\n\n' | scripts/env-tools/setup-env/setup-env.sh >/dev/null
grep -q "^CANARY=should-survive$" env/.env.local-prod-cloudflare.bak \
  || fail "setup-env: a caller's own .bak file was clobbered (sed -i.bak collision regression)"
pass "setup-env: a caller's own .bak file survives (sed -i.bak collision regression guard)"
rm env/.env.local-prod-cloudflare.bak

echo ""
echo "=== check-env: clean file only warns on shipped placeholders ==="
if scripts/env-tools/check-env/check-env.sh env/.env > /tmp/check-env-out.$$; then
  grep -q "WARNING" /tmp/check-env-out.$$ || fail "check-env: expected placeholder warnings, got none"
  pass "check-env: exits 0 with placeholder warnings on a freshly generated dev file"
else
  fail "check-env: unexpectedly failed on a freshly generated dev file"
fi
rm -f /tmp/check-env-out.$$

echo "=== check-env: fails on a placeholder secret + ENVIRONMENT=production ==="
cp env/.env.prod.example env/.env.prod.broken
sed -i.tmp 's/^ENVIRONMENT=.*/ENVIRONMENT=production/' env/.env.prod.broken && rm -f env/.env.prod.broken.tmp
if scripts/env-tools/check-env/check-env.sh env/.env.prod.broken > /tmp/check-env-out2.$$ 2>&1; then
  fail "check-env: should have failed on an un-rotated production file"
else
  grep -q "ERROR" /tmp/check-env-out2.$$ || fail "check-env: failed, but without an ERROR line"
  pass "check-env: fails on a placeholder secret with ENVIRONMENT=production"
fi
rm -f /tmp/check-env-out2.$$ env/.env.prod.broken

echo "=== check-env: warns about a leftover .bak file ==="
cp env/.env env/.env.bak
if scripts/env-tools/check-env/check-env.sh env/.env > /tmp/check-env-out3.$$; then
  grep -q "env/.env.bak still exists" /tmp/check-env-out3.$$ || fail "check-env: did not warn about a leftover env/.env.bak"
  pass "check-env: warns about a leftover .bak file"
else
  fail "check-env: unexpectedly failed just from a leftover .bak file existing"
fi
rm -f /tmp/check-env-out3.$$ env/.env.bak

echo ""
echo "=== rotate-secrets: rotates SECRET_KEY/BUGSINK_SECRET_KEY, leaves other secrets alone ==="
BEFORE_PG="$(grep '^POSTGRES_PASSWORD=' env/.env)"
scripts/env-tools/rotate-secrets/rotate-secrets.sh env/.env >/dev/null
DEV_SECRET_2="$(grep '^SECRET_KEY=' env/.env | cut -d= -f2)"
[ "$DEV_SECRET_2" != "$DEV_SECRET_1" ] || fail "rotate-secrets: SECRET_KEY did not change"
pass "rotate-secrets: SECRET_KEY rotated"
AFTER_PG="$(grep '^POSTGRES_PASSWORD=' env/.env)"
[ "$BEFORE_PG" = "$AFTER_PG" ] || fail "rotate-secrets: touched POSTGRES_PASSWORD, which is out of scope"
pass "rotate-secrets: left POSTGRES_PASSWORD untouched"

echo ""
echo "=== set-env-field: direct KEY=VALUE mode, special characters survive ==="
scripts/env-tools/set-env-field/set-env-field.sh 'FROM_EMAIL=team@example.com' 'SUPPORT_EMAIL=a/b&c=d' >/dev/null
grep -qx "FROM_EMAIL=team@example.com" env/.env || fail "set-env-field: FROM_EMAIL not set in env/.env"
grep -qx "FROM_EMAIL=team@example.com" env/.env.prod || fail "set-env-field: FROM_EMAIL not propagated to env/.env.prod"
grep -qx 'SUPPORT_EMAIL=a/b&c=d' env/.env || fail "set-env-field: special characters mangled"
pass "set-env-field: direct mode sets fields across files, special characters intact"

echo "=== set-env-field: file-based mode skips blank fields ==="
cp scripts/env-tools/set-env-field/shared-values.env.example scripts/env-tools/set-env-field/shared-values.env
sed -i.tmp 's/^GOOGLE_CLIENT_ID=.*/GOOGLE_CLIENT_ID=file-mode-id/' scripts/env-tools/set-env-field/shared-values.env
sed -i.tmp 's/^GEOIPUPDATE_ACCOUNT_ID=.*/GEOIPUPDATE_ACCOUNT_ID=file-mode-maxmind-id/' scripts/env-tools/set-env-field/shared-values.env
sed -i.tmp 's/^USER_EXPORT_MAX_ROWS=.*/USER_EXPORT_MAX_ROWS=25000/' scripts/env-tools/set-env-field/shared-values.env
sed -i.tmp 's/^BUGSINK_SUPERUSER_EMAIL=.*/BUGSINK_SUPERUSER_EMAIL=ops@example.com/' scripts/env-tools/set-env-field/shared-values.env
rm -f scripts/env-tools/set-env-field/shared-values.env.tmp
BEFORE_BUGSINK_PW="$(grep '^BUGSINK_SUPERUSER_PASSWORD=' env/.env)"
scripts/env-tools/set-env-field/set-env-field.sh >/dev/null
grep -qx "GOOGLE_CLIENT_ID=file-mode-id" env/.env || fail "set-env-field: filled-in shared-values.env field not applied"
grep -qx "GEOIPUPDATE_ACCOUNT_ID=file-mode-maxmind-id" env/.env.prod || fail "set-env-field: geolocation field not applied to a prod-shaped file"
grep -qx "USER_EXPORT_MAX_ROWS=25000" env/.env.prod || fail "set-env-field: operational tuning field not applied"
grep -qx "BUGSINK_SUPERUSER_EMAIL=ops@example.com" env/.env.prod || fail "set-env-field: BUGSINK_SUPERUSER_EMAIL not applied to a prod-shaped file"
[ "$(grep '^BUGSINK_SUPERUSER_PASSWORD=' env/.env)" = "$BEFORE_BUGSINK_PW" ] || fail "set-env-field: shared-values.env's excluded BUGSINK_SUPERUSER_PASSWORD was somehow touched"
grep -qx "GMAIL_APP_PASSWORD=<your_gmail_app_password>" env/.env || fail "set-env-field: blank shared-values.env field was applied anyway"
pass "set-env-field: file-based mode applies filled fields, skips blank ones"
rm -f scripts/env-tools/set-env-field/shared-values.env

echo ""
echo "=== copy-env-values: copies real fields, skips freshly generated secrets ==="
cp env/.env env/.env.bak
sed -i.tmp 's/^SUPPORT_EMAIL=.*/SUPPORT_EMAIL=copied-value@example.com/' env/.env.bak && rm -f env/.env.bak.tmp
sed -i.tmp 's/^SECRET_KEY=.*/SECRET_KEY=SHOULD_NOT_SURVIVE/' env/.env.bak && rm -f env/.env.bak.tmp
scripts/env-tools/copy-env-values/copy-env-values.sh env/.env.bak env/.env >/dev/null
grep -qx "SUPPORT_EMAIL=copied-value@example.com" env/.env || fail "copy-env-values: real field was not copied"
grep -qx "SECRET_KEY=SHOULD_NOT_SURVIVE" env/.env && fail "copy-env-values: copied an excluded (freshly generated) field" || pass "copy-env-values: excluded field left untouched"
pass "copy-env-values: non-excluded field copied from old file into new one"
rm -f env/.env.bak

echo ""
echo "All env-tooling regression checks passed."
