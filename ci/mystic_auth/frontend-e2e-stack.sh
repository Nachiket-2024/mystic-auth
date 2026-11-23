#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

MYSTIC_AUTH_ENV="env/mystic_auth/.env.dev"
APP_ENV="env/app/.env.dev"
CREATED_MARKER="env/mystic_auth/.env.dev.ci-created"
COMPOSE_FILES=(
  -f docker/mystic_auth/compose/docker-compose.dev.yml
  -f docker/app/compose/docker-compose.dev.yml
)

# Replaces KEY=value in an env file, appending the line if it is missing.
set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

env_value() {
  grep -m1 "^$1=" "$MYSTIC_AUTH_ENV" | cut -d= -f2-
}

# Stops before "up" would attach to another stack's containers or collide with
# its network: the example defaults match a normal dev stack.
refuse_if_stack_in_use() {
  local project subnet
  project="$(env_value COMPOSE_PROJECT_NAME)"
  subnet="$(env_value DOCKER_SUBNET)"
  if [ -n "$(docker ps -aq --filter "label=com.docker.compose.project=${project}")" ]; then
    echo "::error::Compose project '${project}' already has containers. Set E2E_COMPOSE_PROJECT_NAME (and E2E_DOCKER_SUBNET) before 'prepare' to isolate this run."
    exit 1
  fi
  if docker network ls -q | xargs -r docker network inspect --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' | tr ' ' '\n' | grep -qx "$subnet"; then
    echo "::error::Docker subnet ${subnet} is already used by another network. Set E2E_DOCKER_SUBNET before 'prepare'."
    exit 1
  fi
}

compose() {
  docker compose "${COMPOSE_FILES[@]}" --env-file "$MYSTIC_AUTH_ENV" --env-file "$APP_ENV" "$@"
}

case "${1:-}" in
  prepare)
    if [ -e "$MYSTIC_AUTH_ENV" ] || [ -e "$APP_ENV" ] || [ -e "$CREATED_MARKER" ]; then
      echo "::error::Refusing to reuse existing E2E env files or ownership marker"
      exit 1
    fi
    # Record ownership first, so a partial copy or edit can still be cleaned
    # up by the always-run teardown step.
    touch "$CREATED_MARKER"
    cp env/mystic_auth/.env.dev.example "$MYSTIC_AUTH_ENV"
    cp env/app/.env.dev.example "$APP_ENV"
    sed -i 's/^BUGSINK_SUPERUSER_EMAIL=.*/BUGSINK_SUPERUSER_EMAIL=/' "$MYSTIC_AUTH_ENV"
    sed -i 's/^EMAIL_ENABLED=.*/EMAIL_ENABLED=false/' "$MYSTIC_AUTH_ENV"
    if grep -q '^DEFAULT_APP_POLICIES=' "$APP_ENV"; then
      sed -i 's/^DEFAULT_APP_POLICIES=.*/DEFAULT_APP_POLICIES=/' "$APP_ENV"
    else
      printf '\nDEFAULT_APP_POLICIES=\n' >> "$APP_ENV"
    fi
    # The permission matrix exceeds the normal per-IP request budget.
    sed -i 's/^MAX_REQUESTS_PER_WINDOW=.*/MAX_REQUESTS_PER_WINDOW=1000/' "$MYSTIC_AUTH_ENV"
    # Optional isolation, applied here because prepare rewrites the env file
    # from the example (a value edited earlier would be lost).
    if [ -n "${E2E_COMPOSE_PROJECT_NAME:-}" ]; then
      set_env_value "$MYSTIC_AUTH_ENV" COMPOSE_PROJECT_NAME "$E2E_COMPOSE_PROJECT_NAME"
    fi
    if [ -n "${E2E_DOCKER_SUBNET:-}" ]; then
      set_env_value "$MYSTIC_AUTH_ENV" DOCKER_SUBNET "$E2E_DOCKER_SUBNET"
    fi
    ;;
  up)
    refuse_if_stack_in_use
    compose up -d --build postgres valkey alembic backend frontend procrastinate_worker
    ;;
  wait-backend)
    timeout 150 sh -c 'until curl -sf http://localhost:8000/health/ready >/dev/null 2>&1; do sleep 3; done'
    ;;
  seed-matrix)
    compose exec -T -w /repo backend python local-scripts/mystic_auth/seed-user-permission-matrix.py
    ;;
  wait-frontend)
    timeout 60 sh -c 'until curl -sf http://localhost:5173 >/dev/null 2>&1; do sleep 3; done'
    ;;
  smoke)
    curl -sf http://localhost:8000/health/ready | grep -q '"status":"ok"' \
      && echo "OK: backend /health/ready reports ok through the actual image"
    curl -sf http://localhost:5173 | grep -qi '<div id="root">' \
      && echo "OK: frontend dev server serves the app shell through the actual image"
    ;;
  stop-frontend)
    compose stop frontend
    ;;
  logs)
    compose logs --no-color
    ;;
  down)
    if [ -f "$CREATED_MARKER" ]; then
      # A failed prepare may leave only one copied env file. No Compose
      # project can have started before both files were prepared.
      if [ -f "$MYSTIC_AUTH_ENV" ] && [ -f "$APP_ENV" ]; then
        compose down -v
      fi
      rm -f "$MYSTIC_AUTH_ENV" "$APP_ENV" "$CREATED_MARKER"
    fi
    ;;
  *)
    echo "Usage: $0 {prepare|up|wait-backend|seed-matrix|wait-frontend|smoke|stop-frontend|logs|down}" >&2
    exit 2
    ;;
esac
