#!/usr/bin/env bash
# Thin wrapper around `docker compose -f
# docker/mystic_auth/compose/docker-compose.local-prod-ngrok.yml` that always passes
# --env-file env/mystic_auth/.env.local-prod-ngrok, so this stack never accidentally
# reads dev's env/mystic_auth/.env.dev.
#
# Forwards all arguments, e.g.:
#   scripts/mystic_auth/docker/local-prod-ngrok/local-prod-ngrok-up.sh up -d --build
#   scripts/mystic_auth/docker/local-prod-ngrok/local-prod-ngrok-up.sh logs -f frontend
#
# See local-prod-cloudflare-up.sh / local-prod-tailscale-up.sh for the other
# two local-prod tunnel variants. With no arguments, defaults to `up -d --build`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

if [ "$#" -eq 0 ]; then
  set -- up -d --build
fi

scripts/mystic_auth/env-tools/check-env/check-env.sh \
  env/mystic_auth/.env.local-prod-ngrok \
  env/app/.env.local-prod-ngrok

# GeoIP is opt-in. When this env requests it, include the Compose profile
# automatically so the updater provisions the shared database before
# readiness is checked - a configured path without the profile leaves
# /health/ready reporting "error" forever (see docs/mystic_auth/geolocation/overview.md).
PROFILE_ARGS=()
if awk -F= '$1 == "GEOIP_DB_PATH" && $2 != "" { found=1 } END { exit !found }' env/mystic_auth/.env.local-prod-ngrok; then
  if ! awk -F= '
    $1 == "GEOIPUPDATE_ACCOUNT_ID" && $2 != "" { account=1 }
    $1 == "GEOIPUPDATE_LICENSE_KEY" && $2 != "" { license=1 }
    END { exit !(account && license) }
  ' env/mystic_auth/.env.local-prod-ngrok; then
    echo "ERROR: GEOIP_DB_PATH is set in env/mystic_auth/.env.local-prod-ngrok, but GEOIPUPDATE_ACCOUNT_ID and GEOIPUPDATE_LICENSE_KEY are both required for the GeoIP updater." >&2
    echo "Set both MaxMind credentials or clear GEOIP_DB_PATH before running this script." >&2
    exit 1
  fi
  PROFILE_ARGS=(--profile geoip)
fi

exec docker compose \
  "${PROFILE_ARGS[@]}" \
  -f docker/mystic_auth/compose/docker-compose.local-prod-ngrok.yml \
  -f docker/app/compose/docker-compose.local-prod-ngrok.yml \
  --env-file env/mystic_auth/.env.local-prod-ngrok \
  --env-file env/app/.env.local-prod-ngrok \
  "$@"
