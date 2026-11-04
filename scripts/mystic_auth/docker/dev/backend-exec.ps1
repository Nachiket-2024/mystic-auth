Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# PowerShell counterpart to backend-exec.sh; see that file for why --user root
# is used. Git Bash's `-w /repo` path rewriting never affected PowerShell or
# Command Prompt, so no MSYS_NO_PATHCONV equivalent is needed (see
# docs/mystic_auth/docker/dev-workflow.md#running-a-one-off-command-inside-a-container).
#
# Usage: .\scripts\mystic_auth\docker\dev\backend-exec.ps1 python -m pytest tests/backend/mystic_auth/unit
#        .\scripts\mystic_auth\docker\dev\backend-exec.ps1 alembic heads
#
# -w /repo is needed for pytest (paths are relative to the repo root).
# alembic.ini lives in /repo/backend, so ALEMBIC_CONFIG points alembic at it
# from any cwd.

if ($args.Count -eq 0) {
    Write-Error "Usage: scripts\mystic_auth\docker\dev\backend-exec.ps1 <command> [args...]"
    exit 1
}

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
Set-Location $RepoRoot

docker compose `
  -f docker/mystic_auth/compose/docker-compose.dev.yml `
  -f docker/app/compose/docker-compose.dev.yml `
  --env-file env/mystic_auth/.env.dev `
  --env-file env/app/.env.dev `
  exec --user root -w /repo -e ALEMBIC_CONFIG=/repo/backend/alembic.ini backend @args
exit $LASTEXITCODE
