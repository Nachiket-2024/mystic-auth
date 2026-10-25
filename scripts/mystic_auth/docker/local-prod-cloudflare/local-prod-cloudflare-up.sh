#!/usr/bin/env bash
# Thin wrapper around `docker compose -f
# docker/mystic_auth/compose/docker-compose.local-prod-cloudflare.yml` that always passes
# --env-file env/mystic_auth/.env.local-prod-cloudflare, so this stack never accidentally
# reads dev's env/mystic_auth/.env.dev.
#
# Forwards all arguments, e.g.:
#   scripts/mystic_auth/docker/local-prod-cloudflare/local-prod-cloudflare-up.sh up -d --build
#   scripts/mystic_auth/docker/local-prod-cloudflare/local-prod-cloudflare-up.sh logs -f frontend
#
# See local-prod-ngrok-up.sh / local-prod-tailscale-up.sh for the other two
# local-prod tunnel variants. With no arguments, defaults to `up -d --build`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

if [ "$#" -eq 0 ]; then
  set -- up -d --build
fi

TUNNEL_TOKEN_FILE="env/mystic_auth/.cloudflare-tunnel-token"
if [ ! -s "$TUNNEL_TOKEN_FILE" ] || grep -qxF 'replace_with_your_cloudflare_named_tunnel_token' "$TUNNEL_TOKEN_FILE"; then
  echo "Cloudflare Named Tunnel token file is missing, empty, or still has its example value: $TUNNEL_TOKEN_FILE" >&2
  echo "Copy env/mystic_auth/.cloudflare-tunnel-token.example and replace its contents with the token from Cloudflare Zero Trust." >&2
  exit 1
fi
if [ "$(stat -c '%a' "$TUNNEL_TOKEN_FILE" 2>/dev/null || stat -f '%Lp' "$TUNNEL_TOKEN_FILE")" -gt 600 ]; then
  echo "Cloudflare Named Tunnel token file permissions are too broad; run chmod 600 $TUNNEL_TOKEN_FILE." >&2
  exit 1
fi

scripts/mystic_auth/env-tools/check-env/check-env.sh \
  env/mystic_auth/.env.local-prod-cloudflare \
  env/app/.env.local-prod-cloudflare

exec docker compose \
  -f docker/mystic_auth/compose/docker-compose.local-prod-cloudflare.yml \
  -f docker/app/compose/docker-compose.local-prod-cloudflare.yml \
  --env-file env/mystic_auth/.env.local-prod-cloudflare \
  --env-file env/app/.env.local-prod-cloudflare \
  "$@"
