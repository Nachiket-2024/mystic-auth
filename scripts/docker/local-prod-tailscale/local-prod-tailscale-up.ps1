Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# PowerShell counterpart to local-prod-tailscale-up.sh. Always passes
# --env-file env/.env.local-prod-tailscale, so this stack never accidentally
# reads dev's env/.env.
#
# Usage: .\scripts\docker\local-prod-tailscale-up.ps1 up -d --build
#        .\scripts\docker\local-prod-tailscale-up.ps1 logs -f frontend
# With no arguments, defaults to `up -d --build`.

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
Set-Location $RepoRoot

$ComposeArgs = if ($args.Count -eq 0) { @("up", "-d", "--build") } else { $args }

docker compose -f docker/compose/docker-compose.local-prod-tailscale.yml --env-file env/.env.local-prod-tailscale @ComposeArgs
exit $LASTEXITCODE
