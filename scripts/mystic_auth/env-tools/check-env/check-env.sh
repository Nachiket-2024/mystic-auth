#!/usr/bin/env bash
# Preflight check for a real env/.env* file: catches the two mistakes that
# otherwise only surface as a cryptic runtime error, a silently insecure
# deployment, or Docker's raw "port is already allocated" failure.
#
#   1. ERROR (exit 1): ENVIRONMENT=production in this file, but a secret
#      still equals the shipped placeholder from its .example. Shipping
#      that live means anyone who has ever seen the public template's
#      source can sign your JWTs or read your database.
#   2. WARNING (exit 0, printed): a <your_...>/<your-domain> placeholder is
#      still present (OAuth, SMTP, or a tunnel/domain field), or a host
#      port this file declares is already bound by something else on this
#      machine.
#
# Usage: scripts/env-tools/check-env/check-env.sh [env/.env ...]
# With no arguments, checks every env/.env* file that actually exists.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../../../.."

FILES=("$@")
if [ "${#FILES[@]}" -eq 0 ]; then
  for candidate in env/.env env/.env.prod env/.env.local-prod-cloudflare env/.env.local-prod-ngrok env/.env.local-prod-tailscale; do
    [ -f "$candidate" ] && FILES+=("$candidate")
  done
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "No env files found to check. Run scripts/env-tools/setup-env/setup-env.sh first." >&2
  exit 1
fi

PLACEHOLDER_SECRETS=(
  "SECRET_KEY=change_me_in_production_generate_your_own_random_32plus_char_key"
  "BUGSINK_SECRET_KEY=change_me_in_production_generate_your_own_random_50plus_char_key"
  "POSTGRES_PASSWORD=change_me_in_production"
  "APP_DB_PASSWORD=change_me_in_production"
  "BUGSINK_SUPERUSER_PASSWORD=change_me_in_production"
)

port_in_use() {
  # Portable-enough TCP probe: works without nc/lsof/ss being installed.
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3<&- 3>&-
}

HAS_ERROR=0
HAS_WARNING=0

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "skip (not found): $f"
    continue
  fi

  echo "=== $f ==="
  is_prod=0
  grep -qE '^ENVIRONMENT=production$' "$f" && is_prod=1

  if [ "$is_prod" -eq 1 ]; then
    for entry in "${PLACEHOLDER_SECRETS[@]}"; do
      key="${entry%%=*}"
      if grep -qxF "$entry" "$f"; then
        echo "  ERROR: $key is still the shipped placeholder, but ENVIRONMENT=production."
        HAS_ERROR=1
      fi
    done
  fi

  placeholders="$(grep -oE '<your[a-z_-]*>|<your-domain>' "$f" | sort -u || true)"
  if [ -n "$placeholders" ]; then
    echo "  WARNING: still has placeholder value(s): $(echo "$placeholders" | tr '\n' ' ')"
    HAS_WARNING=1
  fi

  for portvar in POSTGRES_HOST_PORT REDIS_HOST_PORT BACKEND_HOST_PORT FRONTEND_HOST_PORT BUGSINK_HOST_PORT; do
    port="$(grep -m1 "^${portvar}=" "$f" | cut -d= -f2-)"
    [ -n "$port" ] || continue
    if port_in_use "$port"; then
      echo "  WARNING: $portvar=$port is already bound by something else on this machine."
      HAS_WARNING=1
    fi
  done

  if [ -f "$f.bak" ]; then
    echo "  WARNING: $f.bak still exists - a leftover plaintext copy of the old secrets. Delete it once you've confirmed $f is correct."
    HAS_WARNING=1
  fi

  echo
done

if [ "$HAS_ERROR" -eq 1 ]; then
  echo "Found placeholder secrets in a file set to ENVIRONMENT=production. Rotate them before starting this stack:"
  echo "  scripts/env-tools/rotate-secrets/rotate-secrets.sh (SECRET_KEY/BUGSINK_SECRET_KEY only; see its own header for POSTGRES_PASSWORD/APP_DB_PASSWORD/BUGSINK_SUPERUSER_PASSWORD, which need a live-database step too)"
  exit 1
fi

if [ "$HAS_WARNING" -eq 1 ]; then
  echo "Warnings above won't stop the stack from starting, but review them first."
fi

exit 0
