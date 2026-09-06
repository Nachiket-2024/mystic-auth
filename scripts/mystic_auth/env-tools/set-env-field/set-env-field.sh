#!/usr/bin/env bash
# Sets one or more fields across every real env file that already declares
# each key, leaving every other field untouched. For a value that's the
# same everywhere on purpose (SUPPORT_EMAIL, GOOGLE_CLIENT_ID,
# DEFAULT_APP_POLICIES, ...), instead of opening and editing five files by
# hand, one field at a time.
#
# Two ways to use it:
#
#   From a file (no arguments, easiest): copy shared-values.env.example
#   (next to this script) to shared-values.env, fill in whichever fields
#   you want set everywhere with a normal text editor, then run:
#
#     scripts/env-tools/set-env-field/set-env-field.sh
#
#   Nothing here ever puts a value on the command line or asks you to
#   type it into a chat with an AI agent - shared-values.env is gitignored
#   and only this script's own output (field names, never values) needs to
#   be shared with anyone.
#
#   Direct (one-line, scriptable - what docs/agent prompts use):
#
#     scripts/env-tools/set-env-field/set-env-field.sh KEY1=VALUE1 [KEY2=VALUE2 ...] [file ...]
#
#   Any argument containing "=" is a field assignment (only the first "="
#   splits key from value, so a value can itself contain "="). Any
#   argument without "=" is a target file - so file arguments can appear
#   anywhere, not just at the end.
#
# With no file arguments (either form), targets every env/.env* file plus
# frontend/.env that actually exists. A file missing a given KEY= line is
# skipped for that field, not created or appended to - this only ever
# changes a value that's already there.
#
# Uses awk instead of sed so a value is never interpreted as a regex or a
# sed replacement pattern: slashes, ampersands, etc. in a URL or email
# address are safe to pass as-is.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../../../.."

declare -A ASSIGNMENTS=()
KEY_ORDER=()
FILES=()

if [ "$#" -eq 0 ]; then
  VALUES_FILE="$SCRIPT_DIR/shared-values.env"
  if [ ! -f "$VALUES_FILE" ]; then
    echo "No shared-values.env found." >&2
    echo "Copy scripts/env-tools/set-env-field/shared-values.env.example to" >&2
    echo "scripts/env-tools/set-env-field/shared-values.env, fill in the fields you" >&2
    echo "want set everywhere, then run this again." >&2
    exit 1
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    [ -n "$value" ] || continue
    if [ -z "${ASSIGNMENTS[$key]+set}" ]; then
      KEY_ORDER+=("$key")
    fi
    ASSIGNMENTS["$key"]="$value"
  done < "$VALUES_FILE"

  if [ "${#KEY_ORDER[@]}" -eq 0 ]; then
    echo "shared-values.env has no fields filled in. Edit it, then run this again." >&2
    exit 1
  fi
else
  for arg in "$@"; do
    if [[ "$arg" == *=* ]]; then
      key="${arg%%=*}"
      value="${arg#*=}"
      if ! [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
        echo "'$key' doesn't look like an env var name (uppercase letters, digits, underscores)." >&2
        exit 1
      fi
      if [ -z "${ASSIGNMENTS[$key]+set}" ]; then
        KEY_ORDER+=("$key")
      fi
      ASSIGNMENTS["$key"]="$value"
    else
      FILES+=("$arg")
    fi
  done

  if [ "${#KEY_ORDER[@]}" -eq 0 ]; then
    echo "No KEY=VALUE arguments given." >&2
    exit 1
  fi
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  for candidate in env/.env env/.env.prod env/.env.local-prod-cloudflare env/.env.local-prod-ngrok env/.env.local-prod-tailscale frontend/.env; do
    [ -f "$candidate" ] && FILES+=("$candidate")
  done
fi

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "No env files found. Run scripts/env-tools/setup-env/setup-env.sh first." >&2
  exit 1
fi

declare -A SET_IN=()
MISSING_FILES=()

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    MISSING_FILES+=("$f")
    continue
  fi

  tmp="$(mktemp)"
  cp "$f" "$tmp"

  for key in "${KEY_ORDER[@]}"; do
    if grep -q "^${key}=" "$tmp"; then
      awk -v key="$key" -v val="${ASSIGNMENTS[$key]}" '
        BEGIN { pattern = "^" key "=" }
        $0 ~ pattern { print key "=" val; next }
        { print }
      ' "$tmp" > "${tmp}.next"
      mv "${tmp}.next" "$tmp"
      SET_IN["$key"]=1
    fi
  done

  mv "$tmp" "$f"
done

if [ "${#MISSING_FILES[@]}" -gt 0 ]; then
  echo "Not found, skipped: ${MISSING_FILES[*]}"
  echo
fi

# Column widths: widest key name (or the "Field" header, whichever is
# longer) and enough digits for the row count, so the table lines up the
# same regardless of how long an individual field name is.
FIELD_WIDTH=5
for key in "${KEY_ORDER[@]}"; do
  [ "${#key}" -gt "$FIELD_WIDTH" ] && FIELD_WIDTH="${#key}"
done
NO_WIDTH="${#KEY_ORDER[@]}"
NO_WIDTH="${#NO_WIDTH}"
[ "$NO_WIDTH" -lt 3 ] && NO_WIDTH=3

printf '%-*s  %-*s  Updated\n' "$NO_WIDTH" "No." "$FIELD_WIDTH" "Field"

UPDATED_COUNT=0
for i in "${!KEY_ORDER[@]}"; do
  key="${KEY_ORDER[$i]}"
  if [ -n "${SET_IN[$key]:-}" ]; then
    UPDATED_COUNT=$((UPDATED_COUNT + 1))
    printf '%-*d  %-*s  Yes\n' "$NO_WIDTH" "$((i + 1))" "$FIELD_WIDTH" "$key"
  else
    printf '%-*d  %-*s  No\n' "$NO_WIDTH" "$((i + 1))" "$FIELD_WIDTH" "$key"
  fi
done

echo
echo "${UPDATED_COUNT} of ${#KEY_ORDER[@]} field(s) updated."

if [ "$UPDATED_COUNT" -eq 0 ]; then
  echo "No target file declares any of: ${KEY_ORDER[*]}."
  exit 1
fi
