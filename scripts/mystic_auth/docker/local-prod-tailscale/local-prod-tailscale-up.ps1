Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# PowerShell counterpart to local-prod-tailscale-up.sh. Always passes
# --env-file env/mystic_auth/.env.local-prod-tailscale, so this stack never accidentally
# reads dev's env/mystic_auth/.env.
#
# Usage: .\scripts\mystic_auth\docker\local-prod-tailscale\local-prod-tailscale-up.ps1 up -d --build
#        .\scripts\mystic_auth\docker\local-prod-tailscale\local-prod-tailscale-up.ps1 logs -f frontend
# With no arguments, defaults to `up -d --build`.

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
Set-Location $RepoRoot

$ComposeArgs = if ($args.Count -eq 0) { @("up", "-d", "--build") } else { $args }

docker compose `
  -f docker/mystic_auth/compose/docker-compose.local-prod-tailscale.yml `
  -f docker/app/compose/docker-compose.local-prod-tailscale.yml `
  --env-file env/mystic_auth/.env.local-prod-tailscale `
  --env-file env/app/.env.local-prod-tailscale `
  @ComposeArgs
exit $LASTEXITCODE
