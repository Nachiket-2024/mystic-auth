#!/usr/bin/env bash
# Rotates SECRET_KEY and/or BUGSINK_SECRET_KEY in place in real
# env/mystic_auth/.env* files, with a fresh random value for each. Also rotates
# any of your own env/app/ secrets listed in
# scripts/app/env-tools/rotate-secrets/fields.env (ships empty).
#
# Narrow on purpose: only these fields are safe to rotate by editing the file and
# restarting. POSTGRES_PASSWORD, APP_DB_PASSWORD, BUGSINK_SUPERUSER_PASSWORD and
# VALKEY_PASSWORD are also stored by a live service (Postgres applies its
# password only on first volume init; Bugsink keeps its admin password in its
# own database), so change them there first. List a field in fields.env only if
# editing the file and restarting is enough to rotate it.
#
# Usage:
#   scripts/mystic_auth/env-tools/rotate-secrets/rotate-secrets.sh [--field NAME] [file ...]
#
# With no file arguments it rotates every env/mystic_auth/.env* file, plus
# env/app/.env* files if fields.env declares a field. With no --field it
# rotates every applicable field present in each file.
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
  # env/mystic_auth/.env.dev.bak convention scripts/mystic_auth/env-tools/copy-env-values/ expects.
  local tmp
  tmp="$(mktemp)"
  sed "$1" "$2" > "$tmp" && mv "$tmp" "$2"
}

# mystic_auth's own fields (fixed lengths, always in scope) plus whatever
# a fork declared in its own fields.env (name:length pairs).
declare -A FIELD_LENGTHS=(
  [SECRET_KEY]=40
  [BUGSINK_SECRET_KEY]=60
)

APP_FIELDS_FILE="scripts/app/env-tools/rotate-secrets/fields.env"
if [ -f "$APP_FIELDS_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    length="${line#*=}"
    [ -n "$length" ] || length=40
    FIELD_LENGTHS["$key"]="$length"
  done < "$APP_FIELDS_FILE"
fi

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

if [ -n "$FIELD" ] && [ -z "${FIELD_LENGTHS[$FIELD]+set}" ]; then
  echo "Unknown --field '$FIELD'. Known fields: ${!FIELD_LENGTHS[*]}." >&2
  echo "Add your own to scripts/app/env-tools/rotate-secrets/fields.env to extend this." >&2
  exit 1
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  # Globs rather than a fixed list, so a fork's own new mode (e.g. a
  # hand-added env/mystic_auth/.env.staging) is rotated too.
  GLOB_DIRS=("env/mystic_auth")
  [ -f "$APP_FIELDS_FILE" ] && GLOB_DIRS+=("env/app")
  for dir in "${GLOB_DIRS[@]}"; do
    for candidate in "$dir"/.env*; do
      case "$candidate" in
        *.example|*.bak|*.ci-created) continue ;;
      esac
      [ -f "$candidate" ] && FILES+=("$candidate")
    done
  done
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "No env files found to rotate. Run scripts/mystic_auth/env-tools/setup-env/setup-env.sh first." >&2
  exit 1
fi

ROTATED_ANY=0

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "skip (not found): $f"
    continue
  fi

  rotated_here=()

  for key in "${!FIELD_LENGTHS[@]}"; do
    if { [ -z "$FIELD" ] || [ "$FIELD" = "$key" ]; } && grep -q "^${key}=" "$f"; then
      sed_inplace "s|^${key}=.*|${key}=$(gen_secret "${FIELD_LENGTHS[$key]}")|" "$f"
      rotated_here+=("$key")
    fi
  done

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
