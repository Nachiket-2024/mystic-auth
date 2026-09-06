#!/usr/bin/env bash
# Rotates SECRET_KEY and/or BUGSINK_SECRET_KEY in place in one or more real
# env/.env* files, generating a fresh random value for each.
#
# Scope is deliberately narrow: these two fields are the only secrets safe
# to rotate by just editing the file and restarting. Every other secret
# field (POSTGRES_PASSWORD, APP_DB_PASSWORD, BUGSINK_SUPERUSER_PASSWORD,
# REDIS_PASSWORD) is backed by state a live service already has: Postgres
# only applies POSTGRES_PASSWORD on first volume init, so editing the file
# after that does nothing to the role's real password and just breaks
# DATABASE_URL; Bugsink's admin password lives in its own database, not
# this file. Rotating those safely means changing them at the live service
# (ALTER ROLE, Bugsink's own admin tools) first, not something this script
# attempts.
#
# Usage:
#   scripts/env-tools/rotate-secrets/rotate-secrets.sh [--field SECRET_KEY|BUGSINK_SECRET_KEY] [file ...]
#
# With no file arguments, rotates every env/.env* file that actually exists
# (env/.env, env/.env.prod, env/.env.local-prod-{cloudflare,ngrok,tailscale}).
# With no --field, rotates both fields wherever present in a given file.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../../../.."

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate secrets." >&2
  exit 1
fi

gen_secret() {
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

FIELD=""
FILES=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --field)
      FIELD="$2"
      shift 2
      ;;
    *)
      FILES+=("$1")
      shift
      ;;
  esac
done

if [ -n "$FIELD" ] && [ "$FIELD" != "SECRET_KEY" ] && [ "$FIELD" != "BUGSINK_SECRET_KEY" ]; then
  echo "Unknown --field '$FIELD'. Only SECRET_KEY and BUGSINK_SECRET_KEY are safe to rotate this way." >&2
  exit 1
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  for candidate in env/.env env/.env.prod env/.env.local-prod-cloudflare env/.env.local-prod-ngrok env/.env.local-prod-tailscale; do
    [ -f "$candidate" ] && FILES+=("$candidate")
  done
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "No env files found to rotate. Run scripts/env-tools/setup-env/setup-env.sh first." >&2
  exit 1
fi

ROTATED_ANY=0

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "skip (not found): $f"
    continue
  fi

  rotated_here=()

  if { [ -z "$FIELD" ] || [ "$FIELD" = "SECRET_KEY" ]; } && grep -q '^SECRET_KEY=' "$f"; then
    sed_inplace "s|^SECRET_KEY=.*|SECRET_KEY=$(gen_secret 40)|" "$f"
    rotated_here+=("SECRET_KEY")
  fi

  if { [ -z "$FIELD" ] || [ "$FIELD" = "BUGSINK_SECRET_KEY" ]; } && grep -q '^BUGSINK_SECRET_KEY=' "$f"; then
    sed_inplace "s|^BUGSINK_SECRET_KEY=.*|BUGSINK_SECRET_KEY=$(gen_secret 60)|" "$f"
    rotated_here+=("BUGSINK_SECRET_KEY")
  fi

  if [ "${#rotated_here[@]}" -gt 0 ]; then
    echo "rotated in $f: ${rotated_here[*]}"
    ROTATED_ANY=1
  else
    echo "nothing to rotate in $f"
  fi
done

if [ "$ROTATED_ANY" -eq 1 ]; then
  echo
  echo "Restart whichever stack reads the rotated file(s) for the new value to take effect."
  echo "Rotating SECRET_KEY invalidates every outstanding access/refresh token and session:"
  echo "everyone gets logged out. Rotating BUGSINK_SECRET_KEY invalidates Bugsink's own"
  echo "signed sessions/cookies the same way."
fi
