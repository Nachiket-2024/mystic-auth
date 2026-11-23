#!/usr/bin/env bash
# Regression test for ci/mystic_auth/frontend-e2e-stack.sh isolation: prepare
# must apply E2E_COMPOSE_PROJECT_NAME / E2E_DOCKER_SUBNET after copying the
# examples, and up must refuse when the project or subnet is already in use.
# Runs in a temporary copy with a fake docker, so it never starts anything.
set -euo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/ci/mystic_auth" "$TMP/env/mystic_auth" "$TMP/env/app"
cp "$BASE/ci/mystic_auth/frontend-e2e-stack.sh" "$TMP/ci/mystic_auth/"
cp "$BASE/env/mystic_auth/.env.dev.example" "$TMP/env/mystic_auth/"
cp "$BASE/env/app/.env.dev.example" "$TMP/env/app/"

# Fake docker: FAKE_CONTAINERS / FAKE_SUBNETS control what "exists".
cat > "$TMP/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
case "$1" in
  ps) printf '%s' "${FAKE_CONTAINERS:-}" ;;
  network)
    case "$2" in
      ls) [ -n "${FAKE_SUBNETS:-}" ] && echo net1 ;;
      inspect) shift 2; printf '%s \n' "${FAKE_SUBNETS:-}" ;;
    esac ;;
  compose) echo "compose $*" >> "$FAKE_LOG" ;;
esac
DOCKER
chmod +x "$TMP/bin/docker"
export PATH="$TMP/bin:$PATH" FAKE_LOG="$TMP/log"
cd "$TMP"
script=ci/mystic_auth/frontend-e2e-stack.sh
fail() { echo "FAIL: $*" >&2; exit 1; }
env_file=env/mystic_auth/.env.dev

E2E_COMPOSE_PROJECT_NAME=iso-e2e E2E_DOCKER_SUBNET=172.31.9.0/24 "$script" prepare
grep -qx 'COMPOSE_PROJECT_NAME=iso-e2e' "$env_file" || fail "project name override not applied"
grep -qx 'DOCKER_SUBNET=172.31.9.0/24' "$env_file" || fail "subnet override not applied"

"$script" up || fail "up should pass for a free project and subnet"
grep -q 'compose.*up -d' "$FAKE_LOG" || fail "up did not reach compose"

: > "$FAKE_LOG"
if FAKE_CONTAINERS=abc123 "$script" up 2>/dev/null; then fail "up must refuse an existing project"; fi
if FAKE_SUBNETS=172.31.9.0/24 "$script" up 2>/dev/null; then fail "up must refuse a used subnet"; fi
[ ! -s "$FAKE_LOG" ] || fail "compose ran despite a refusal"

rm -f "$env_file" env/app/.env.dev env/mystic_auth/.env.dev.ci-created
"$script" prepare
grep -qx 'COMPOSE_PROJECT_NAME=mystic-auth-dev' "$env_file" || fail "defaults changed without overrides"

echo "frontend-e2e-stack tests passed"
