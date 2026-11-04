#!/usr/bin/env bash
# One-time (and safe to re-run) setup of the self-hosted ntfy service that
# carries the app's security alerts. Creates two accounts and nothing else:
#   mystic-auth-app  write-only on the alert topic, used by the backend and worker via a token
#   <phone user>     read-only on the alert topic, used by the ntfy phone app
# ntfy denies everything else, so a leaked phone password cannot post alerts and
# a leaked app token cannot read them.
#
# Usage: scripts/mystic_auth/ntfy/ntfy-setup.sh [compose-file] [phone-user]
#   compose-file defaults to docker-compose.prod.yml; a basename is looked up
#   under docker/mystic_auth/compose/ and docker/app/compose/, or give a path.
#   phone-user defaults to "phone".
# The ntfy service must already be running (start the stack first).
# Prints the env lines to paste; secrets are shown once on screen and never
# written to a file by this script.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../" && pwd)"
cd "$REPO_ROOT"

COMPOSE_ARG="${1:-docker-compose.prod.yml}"
PHONE_USER="${2:-phone}"
APP_USER="mystic-auth-app"
COMPOSE_BASENAME="$(basename "$COMPOSE_ARG")"
case "$COMPOSE_ARG" in
  */*) COMPOSE_FILES=("$COMPOSE_ARG") ;;
  *) COMPOSE_FILES=("docker/mystic_auth/compose/$COMPOSE_BASENAME" "docker/app/compose/$COMPOSE_BASENAME") ;;
esac

MODE="${COMPOSE_BASENAME#docker-compose.}"
MODE="${MODE%.yml}"
ENV_FILE="env/mystic_auth/.env.${MODE}"
APP_ENV_FILE="env/app/.env.${MODE}"

DC_ARGS=()
for f in "${COMPOSE_FILES[@]}"; do [ -f "$f" ] && DC_ARGS+=(-f "$f"); done
for f in "$ENV_FILE" "$APP_ENV_FILE"; do [ -f "$f" ] && DC_ARGS+=(--env-file "$f"); done

env_value() { grep -hm1 "^$1=" "$APP_ENV_FILE" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true; }

ALERT_URL="$(env_value SECURITY_ALERT_WEBHOOK_URL)"
TOPIC="${ALERT_URL##*/}"
if [ -z "$TOPIC" ] || [ "$TOPIC" = "$ALERT_URL" ]; then
  echo "SECURITY_ALERT_WEBHOOK_URL in $ENV_FILE must end in a topic name, for example http://ntfy:8080/mystic-auth-alerts" >&2
  exit 1
fi
BASE_URL="$(env_value NTFY_BASE_URL)"

ntfy_exec() { docker compose "${DC_ARGS[@]}" exec -T ntfy "$@"; }
# Forwards NTFY_PASSWORD from this shell by name, so the password never
# appears in a process list.
ntfy_exec_pw() { docker compose "${DC_ARGS[@]}" exec -T -e NTFY_PASSWORD ntfy "$@"; }

if ! ntfy_exec ntfy user list >/dev/null 2>&1; then
  echo "The ntfy service is not running for $COMPOSE_BASENAME. Start the stack first." >&2
  exit 1
fi

user_exists() { ntfy_exec ntfy user list 2>/dev/null | grep -q "^user $1 ("; }
random_secret() { head -c 24 /dev/urandom | base64 | tr -d '/+=\n' | cut -c1-24; }

PHONE_PASSWORD=""
if user_exists "$APP_USER"; then
  echo "User $APP_USER already exists, keeping it."
else
  NTFY_PASSWORD="$(random_secret)" ntfy_exec_pw ntfy user add --role=user "$APP_USER" >/dev/null
  echo "Created user $APP_USER."
fi
if user_exists "$PHONE_USER"; then
  echo "User $PHONE_USER already exists, keeping its password."
else
  PHONE_PASSWORD="$(random_secret)"
  NTFY_PASSWORD="$PHONE_PASSWORD" ntfy_exec_pw ntfy user add --role=user "$PHONE_USER" >/dev/null
  echo "Created user $PHONE_USER."
fi

ntfy_exec ntfy access "$APP_USER" "$TOPIC" write-only >/dev/null
ntfy_exec ntfy access "$PHONE_USER" "$TOPIC" read-only >/dev/null

TOKEN="$(ntfy_exec ntfy token list "$APP_USER" 2>/dev/null | grep -o 'tk_[A-Za-z0-9]*' | head -n1 || true)"
if [ -z "$TOKEN" ]; then
  TOKEN="$(ntfy_exec ntfy token add --label=mystic-auth-backend "$APP_USER" 2>&1 | grep -o 'tk_[A-Za-z0-9]*' | head -n1)"
fi
[ -n "$TOKEN" ] || { echo "Could not create or read the app token." >&2; exit 1; }

ntfy_exec ntfy publish --token "$TOKEN" "http://localhost:8080/$TOPIC" "ntfy setup test: if your phone shows this, alerts will reach you." >/dev/null
echo "Sent a test message to topic $TOPIC."

cat <<OUT

Put this in $ENV_FILE, then restart the backend and worker
(re-run the stack's up script):

  SECURITY_ALERT_WEBHOOK_TOKEN=$TOKEN

Phone app (ntfy): Settings > Add user, then subscribe to the topic.
  Server:   ${BASE_URL:-<NTFY_BASE_URL>}
  Topic:    $TOPIC
  Username: $PHONE_USER
OUT
if [ -n "$PHONE_PASSWORD" ]; then
  echo "  Password: $PHONE_PASSWORD   (shown once; store it in your password manager)"
else
  echo "  Password: unchanged (set when the user was first created)"
fi
