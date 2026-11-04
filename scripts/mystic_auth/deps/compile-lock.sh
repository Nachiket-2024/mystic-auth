#!/usr/bin/env bash
# Regenerates backend/requirements.txt and backend/requirements-dev.txt (the
# hashed lockfiles) from backend/requirements.in and requirements-dev.in.
#
#   scripts/mystic_auth/deps/compile-lock.sh           rewrite both lockfiles
#   scripts/mystic_auth/deps/compile-lock.sh --check   fail if a lockfile is out of date (CI)
#   scripts/mystic_auth/deps/compile-lock.sh --upgrade re-resolve to the newest allowed versions
#
# Needs `uv` (pip install uv==0.13.7). uv is only used to compile; installs
# everywhere still use plain pip with --require-hashes.
# See docs/mystic_auth/deployment/dependency-locking.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKEND="$REPO_ROOT/backend"
PYTHON_VERSION="3.14"
MODE="write"
UPGRADE=()

for arg in "$@"; do
  case "$arg" in
    --check) MODE="check" ;;
    --upgrade) UPGRADE=(--upgrade) ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

command -v uv >/dev/null 2>&1 || { echo "uv is not installed. Run: pip install uv==0.13.7" >&2; exit 1; }

compile() { # <source .in> <output> [extra args]
  local source="$1" output="$2"; shift 2
  (cd "$BACKEND" && uv pip compile "$source" \
    --output-file "$output" \
    --universal --python-version "$PYTHON_VERSION" \
    --generate-hashes --no-strip-markers --quiet \
    --custom-compile-command "scripts/mystic_auth/deps/compile-lock.sh" \
    "$@")
}

if [ "$MODE" = "check" ]; then
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  cp "$BACKEND/requirements.txt" "$BACKEND/requirements-dev.txt" "$TMP/"
  # Fresh resolution into the real paths, compared with the committed copies.
  compile requirements.in requirements.txt
  compile requirements-dev.in requirements-dev.txt -c requirements.txt
  status=0
  for f in requirements.txt requirements-dev.txt; do
    if ! diff -u "$TMP/$f" "$BACKEND/$f" >/dev/null; then
      echo "backend/$f is out of date with its .in file. Run scripts/mystic_auth/deps/compile-lock.sh and commit the result." >&2
      status=1
    fi
    cp "$TMP/$f" "$BACKEND/$f"   # restore the committed copy: --check never modifies the tree
  done
  exit "$status"
fi

compile requirements.in requirements.txt "${UPGRADE[@]}"
compile requirements-dev.in requirements-dev.txt -c requirements.txt "${UPGRADE[@]}"
echo "Wrote backend/requirements.txt and backend/requirements-dev.txt"
