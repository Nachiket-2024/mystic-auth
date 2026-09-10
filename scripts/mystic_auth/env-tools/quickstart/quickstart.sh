#!/usr/bin/env bash
# One command from a fresh clone to a running dev stack with a login you can
# use: runs setup-env if env/mystic_auth/.env doesn't exist yet, brings the
# stack up and waits for it to be healthy, offers to create the system
# superuser, then tails logs like dev-up.sh normally does.
#
# Safe to re-run: setup-env is skipped once env/mystic_auth/.env exists,
# `docker compose up` is idempotent, and system superuser creation is
# opt-in each time.
#
# Usage: ./scripts/mystic_auth/env-tools/quickstart/quickstart.sh   (Git Bash / WSL / Linux / macOS)
# PowerShell: .\scripts\mystic_auth\env-tools\quickstart\quickstart.ps1
# Command Prompt: scripts\mystic_auth\env-tools\quickstart\quickstart.cmd
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f env/mystic_auth/.env ]; then
  echo "No env/mystic_auth/.env found: running first-time setup."
  echo
  ./scripts/mystic_auth/env-tools/setup-env/setup-env.sh
  echo
fi

echo "Starting the dev stack..."
echo
DEV_UP_TAIL=0 ./scripts/mystic_auth/docker/dev/dev-up.sh
status=$?
if [ "$status" -ne 0 ]; then
  echo
  echo "Stack failed to start. See the error above; nothing further to do here."
  exit "$status"
fi

DC=(docker compose \
  -f docker/mystic_auth/compose/docker-compose.dev.yml \
  -f docker/app/compose/docker-compose.dev.yml \
  --env-file env/mystic_auth/.env \
  --env-file env/app/.env)

echo
read -rp "Create the system superuser now? [Y/n] " create_su
create_su="${create_su:-Y}"
if [[ "$create_su" =~ ^[Yy] ]]; then
  "${DC[@]}" exec -it backend python -m mystic_auth.scripts.create_system_user
fi

echo
echo "--- Ready ---"
echo "Frontend:  http://localhost:5173"
echo "API docs:  http://localhost:8000/docs"
echo "Bugsink:   http://localhost:8010 (error monitoring)"
echo
echo "Still need real values for Google OAuth / SMTP / anything else?"
echo "See docs/mystic_auth/template-usage/overview.md."
echo
echo "Tailing backend + frontend + procrastinate_worker (Ctrl+C stops watching, stack keeps running)."
exec "${DC[@]}" logs -f backend frontend procrastinate_worker
