Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# PowerShell counterpart to prod-up.sh. Always passes --env-file .env.prod,
# so this stack never accidentally reads dev's ./.env.
#
# Usage: .\scripts\docker\prod-up.ps1 up -d --build
#        .\scripts\docker\prod-up.ps1 logs -f frontend
# With no arguments, defaults to `up -d --build`.

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $RepoRoot

$ComposeArgs = if ($args.Count -eq 0) { @("up", "-d", "--build") } else { $args }

docker compose -f docker-compose.prod.yml --env-file .env.prod @ComposeArgs
exit $LASTEXITCODE
