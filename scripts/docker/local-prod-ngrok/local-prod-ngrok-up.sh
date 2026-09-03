#!/usr/bin/env bash
# Thin wrapper around `docker compose -f
# docker/compose/docker-compose.local-prod-ngrok.yml` that always passes
# --env-file env/.env.local-prod-ngrok, so this stack never accidentally
# reads dev's env/.env.
#
# Forwards all arguments, e.g.:
#   scripts/docker/local-prod-ngrok/local-prod-ngrok-up.sh up -d --build
#   scripts/docker/local-prod-ngrok/local-prod-ngrok-up.sh logs -f frontend
#
# See local-prod-cloudflare-up.sh / local-prod-tailscale-up.sh for the other
# two local-prod tunnel variants. With no arguments, defaults to `up -d --build`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

if [ "$#" -eq 0 ]; then
  set -- up -d --build
fi

exec docker compose -f docker/compose/docker-compose.local-prod-ngrok.yml --env-file env/.env.local-prod-ngrok "$@"
