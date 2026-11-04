#!/usr/bin/env bash
# Thin wrapper around `docker compose exec` for the backend container, with the
# workarounds from
# docs/mystic_auth/docker/dev-workflow.md#running-a-one-off-command-inside-a-container:
#
#   - MSYS_NO_PATHCONV=1: Git Bash would rewrite `-w /repo` into a Windows path
#     and docker.exe fails with "Cwd must be an absolute path".
#   - --user root: pytest.ini writes coverage output to /repo, which is
#     bind-mounted with the host's ownership, not the container's `app` user
#     (matters on native Linux, harmless elsewhere).
#   - -w /repo: pytest paths are relative to the repo root. alembic.ini is in
#     /repo/backend, so ALEMBIC_CONFIG points alembic at it from any cwd.
#
# Each is a no-op where it does not apply, so this is safe on every platform.
#
# Usage: scripts/mystic_auth/docker/dev/backend-exec.sh <command> [args...]
#   scripts/mystic_auth/docker/dev/backend-exec.sh python -m pytest tests/backend/mystic_auth/unit
#   scripts/mystic_auth/docker/dev/backend-exec.sh alembic heads
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "Usage: scripts/mystic_auth/docker/dev/backend-exec.sh <command> [args...]" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

MSYS_NO_PATHCONV=1 exec docker compose \
  -f docker/mystic_auth/compose/docker-compose.dev.yml \
  -f docker/app/compose/docker-compose.dev.yml \
  --env-file env/mystic_auth/.env.dev \
  --env-file env/app/.env.dev \
  exec --user root -w /repo -e ALEMBIC_CONFIG=/repo/backend/alembic.ini backend "$@"
