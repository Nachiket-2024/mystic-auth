# One command from a fresh clone to a running dev stack with a login you can
# use: runs setup-env if env/.env doesn't exist yet, brings the stack up and
# waits for it to be healthy, offers to create the system superuser, then
# tails logs like dev-up.ps1 normally does.
#
# Safe to re-run: setup-env is skipped once env/.env exists, `docker compose
# up` is idempotent, and system superuser creation is opt-in each time.
$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
Set-Location $RepoRoot

if (-not (Test-Path "env/.env")) {
    Write-Host "No env/.env found: running first-time setup."
    Write-Host ""
    & "./scripts/env-tools/setup-env/setup-env.ps1"
    Write-Host ""
}

Write-Host "Starting the dev stack..."
Write-Host ""
$env:DEV_UP_TAIL = "0"
& "./scripts/docker/dev/dev-up.ps1"
$status = $LASTEXITCODE
Remove-Item Env:\DEV_UP_TAIL -ErrorAction SilentlyContinue
if ($status -ne 0) {
    Write-Host ""
    Write-Host "Stack failed to start. See the error above; nothing further to do here."
    exit $status
}

$DC = @("-f", "docker/compose/docker-compose.dev.yml", "--env-file", "env/.env")

Write-Host ""
$createSu = Read-Host "Create the system superuser now? [Y/n]"
if ([string]::IsNullOrWhiteSpace($createSu)) { $createSu = "Y" }
if ($createSu -match '^[Yy]') {
    docker compose @DC exec -it backend python -m mystic_auth.scripts.create_system_user
}

Write-Host ""
Write-Host "--- Ready ---"
Write-Host "Frontend:  http://localhost:5173"
Write-Host "API docs:  http://localhost:8000/docs"
Write-Host "Bugsink:   http://localhost:8010 (error monitoring)"
Write-Host ""
Write-Host "Still need real values for Google OAuth / SMTP / anything else?"
Write-Host "See docs/mystic_auth/template-usage/overview.md."
Write-Host ""
Write-Host "Tailing backend + frontend + procrastinate_worker (Ctrl+C stops watching, stack keeps running)."
docker compose @DC logs -f backend frontend procrastinate_worker
exit $LASTEXITCODE
