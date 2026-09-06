#!/usr/bin/env bash
# Bootstraps every env/.env* file (plus frontend/.env) from its .example,
# generating a distinct random value for every secret/password field and
# applying one app name / brand color across all of them. Never touches a
# file that already exists - safe to re-run after filling in your own
# per-mode fields (OAuth, SMTP, domain, tunnel tokens) by hand.
#
# See docs/mystic_auth/template-usage/overview.md for what's still yours to
# fill in after this runs.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../../../.."

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate secrets." >&2
  exit 1
fi

gen_secret() {
  # $1 = length. Alnum-only so it's always safe embedded in a URL or sed pattern.
  openssl rand -base64 "$(( $1 * 2 ))" | tr -dc 'A-Za-z0-9' | head -c "$1"
}

sed_inplace() {
  # Portable `sed -i` across GNU and BSD sed, via a temp file rather than
  # `-i.bak`: that flag's fixed ".bak" suffix would collide with (and
  # delete) a same-named backup a caller made on purpose, e.g. the
  # env/.env.bak convention scripts/env-tools/copy-env-values/ expects.
  local tmp
  tmp="$(mktemp)"
  sed "$1" "$2" > "$tmp" && mv "$tmp" "$2"
}

read -rp "App name [MysticAuth]: " APP_NAME_INPUT
APP_NAME_INPUT="${APP_NAME_INPUT:-MysticAuth}"
read -rp "Brand color hex [#d97706]: " BRAND_COLOR_INPUT
BRAND_COLOR_INPUT="${BRAND_COLOR_INPUT:-#d97706}"

# src:dst pairs. Order doesn't matter; each is handled independently.
PAIRS=(
  "env/.env.example:env/.env"
  "env/.env.prod.example:env/.env.prod"
  "env/.env.local-prod-cloudflare.example:env/.env.local-prod-cloudflare"
  "env/.env.local-prod-ngrok.example:env/.env.local-prod-ngrok"
  "env/.env.local-prod-tailscale.example:env/.env.local-prod-tailscale"
  "frontend/.env.example:frontend/.env"
)

STILL_NEEDED=()

for pair in "${PAIRS[@]}"; do
  src="${pair%%:*}"
  dst="${pair##*:}"

  [ -f "$src" ] || continue

  if [ -f "$dst" ]; then
    echo "skip (already exists): $dst"
    continue
  fi

  cp "$src" "$dst"

  # App name / brand color, backend and frontend spellings.
  sed_inplace "s|^APP_NAME=.*|APP_NAME=${APP_NAME_INPUT}|" "$dst"
  sed_inplace "s|^BRAND_COLOR=.*|BRAND_COLOR=${BRAND_COLOR_INPUT}|" "$dst"
  sed_inplace "s|^VITE_APP_NAME=.*|VITE_APP_NAME=${APP_NAME_INPUT}|" "$dst"
  sed_inplace "s|^VITE_BRAND_COLOR=.*|VITE_BRAND_COLOR=${BRAND_COLOR_INPUT}|" "$dst"

  # Distinct generated secrets, only for fields that ship a shared
  # "change_me_in_production..." placeholder. Each variable and each file
  # gets its own independently generated value - a leaked dev secret
  # doesn't compromise prod, and Postgres's superuser password never
  # matches the app role's or Bugsink's.
  if grep -q '^POSTGRES_PASSWORD=' "$dst"; then
    PG_PW="$(gen_secret 24)"
    sed_inplace "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PW}|" "$dst"
    sed_inplace "s|postgres:change_me_in_production@|postgres:${PG_PW}@|g" "$dst"
  fi

  if grep -q '^APP_DB_PASSWORD=' "$dst"; then
    APP_PW="$(gen_secret 24)"
    sed_inplace "s|^APP_DB_PASSWORD=.*|APP_DB_PASSWORD=${APP_PW}|" "$dst"
    sed_inplace "s|mystic_auth_app:change_me_in_production@|mystic_auth_app:${APP_PW}@|g" "$dst"
  fi

  if grep -q '^SECRET_KEY=' "$dst"; then
    sed_inplace "s|^SECRET_KEY=.*|SECRET_KEY=$(gen_secret 40)|" "$dst"
  fi

  if grep -q '^BUGSINK_SECRET_KEY=' "$dst"; then
    sed_inplace "s|^BUGSINK_SECRET_KEY=.*|BUGSINK_SECRET_KEY=$(gen_secret 60)|" "$dst"
  fi

  if grep -q '^BUGSINK_SUPERUSER_PASSWORD=' "$dst"; then
    sed_inplace "s|^BUGSINK_SUPERUSER_PASSWORD=.*|BUGSINK_SUPERUSER_PASSWORD=$(gen_secret 24)|" "$dst"
  fi

  echo "created: $dst"

  # REDIS_PASSWORD is deliberately left blank: it's optional hardening, and
  # setting it also requires manually rewriting REDIS_URL to embed it (see
  # docs/mystic_auth/security/hardening-infra.md#redis-authentication) -
  # not something safe to script blindly.

  placeholders="$(grep -oE '<your[a-z_-]*>|<your-domain>' "$dst" | sort -u || true)"
  if [ -n "$placeholders" ]; then
    STILL_NEEDED+=("$dst: $(echo "$placeholders" | tr '\n' ' ')")
  fi
done

echo
echo "Done. Secrets, APP_NAME, and BRAND_COLOR are filled in wherever a new file was created."
if [ "${#STILL_NEEDED[@]}" -gt 0 ]; then
  echo "Still needs your own values (Google OAuth, SMTP, domain, tunnel tokens):"
  for line in "${STILL_NEEDED[@]}"; do
    echo "  - $line"
  done
fi
echo "See docs/mystic_auth/template-usage/overview.md for OAuth/SMTP/tunnel setup."
