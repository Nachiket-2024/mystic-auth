#!/usr/bin/env bash
# Regression test for sync-upstream.sh, run against throwaway fake
# "upstream" and "consumer" repos under a temp dir. Never touches this
# repo's own history. Run manually after touching sync-upstream.sh:
#   tests/scripts/mystic_auth/upstream-sync/test-sync-upstream.sh
#
# Covers the two bugs a naive `git merge --squash` sync has, which the
# incremental-diff design fixes:
#   - stale "incoming commits" preview after the first sync
#   - phantom conflicts on files nobody touched, once there's no merge-base
# plus the real conflict path, the squash-history-never-imported property,
# and upgrading an existing repo that predates the state-file mechanism.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
REAL_SCRIPT="$REPO_ROOT/scripts/mystic_auth/upstream-sync/sync-upstream.sh"
REAL_SCRIPT_DIR="$REPO_ROOT/scripts/mystic_auth/upstream-sync"
BASE="$(mktemp -d)"
trap 'rm -rf "$BASE"' EXIT
cd "$BASE"

# sync-upstream.sh finds its repo root via its own file location, not the
# caller's cwd, so a fake repo needs its own copy at the same relative path
# (scripts/mystic_auth/upstream-sync/). check-alembic-heads.sh comes along too, since
# sync-upstream.sh looks for it next to itself.
REAL_ALEMBIC_SCRIPT="$REPO_ROOT/scripts/mystic_auth/upstream-sync/check-alembic-heads.sh"
install_script() {
  mkdir -p "$1/scripts/mystic_auth/upstream-sync"
  cp "$REAL_SCRIPT" "$1/scripts/mystic_auth/upstream-sync/sync-upstream.sh"
  cp "$REAL_ALEMBIC_SCRIPT" "$1/scripts/mystic_auth/upstream-sync/check-alembic-heads.sh"
  for module in sync-upstream-review.sh sync-upstream-apply.sh sync-upstream-finalize.sh; do
    cp "$REAL_SCRIPT_DIR/$module" "$1/scripts/mystic_auth/upstream-sync/$module"
    chmod +x "$1/scripts/mystic_auth/upstream-sync/$module"
  done
  chmod +x "$1/scripts/mystic_auth/upstream-sync/sync-upstream.sh" "$1/scripts/mystic_auth/upstream-sync/check-alembic-heads.sh"
}

# A minimal but structurally real alembic migration file -- just enough for
# check-alembic-heads.sh's static parsing (revision/down_revision lines) to
# treat it like a genuine migration.
make_migration() {
  local dir="$1" revision="$2" down_revision="$3" message="$4"
  mkdir -p "$dir"
  cat > "$dir/${revision}_${message// /_}.py" <<EOF
"""${message}

Revision ID: ${revision}
Revises: ${down_revision}

"""
revision: str = '${revision}'
down_revision: str | None = $( [ "$down_revision" = "None" ] && echo "None" || echo "'${down_revision}'" )
EOF
}

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }


SCRIPT_DIR="$REPO_ROOT/tests/scripts/mystic_auth/upstream-sync"
# These phases share the same temporary repositories and helper functions;
# source them in order so the public test command stays one invocation.
source "$SCRIPT_DIR/test-sync-upstream-history.sh"
source "$SCRIPT_DIR/test-sync-upstream-safety.sh"
source "$SCRIPT_DIR/test-sync-upstream-ownership.sh"
