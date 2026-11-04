#!/usr/bin/env bash
# Regression guard: quickstart.sh/.ps1 once called `./scripts/env-tools/...`
# (missing the `mystic_auth/` segment) after a restructure, so the first README
# command failed for every new user and nothing caught it.
#
# Scans every CI file, script (.sh/.ps1/.cmd/.bat), Makefile and doc (.md) for a
# path token containing `ci/`, `scripts/` or `local-scripts/` that ends in
# .sh/.py/.ps1/.cmd/.bat (either slash), and asserts the target exists. It
# matches the whole contiguous token, so `backend/mystic_auth/scripts/x.py` is
# not misreported. It also checks each Dockerfile `COPY <src>` line (skipping
# `--from=`), which `docker compose config` never does.
#
# Excluded on purpose:
#   - this file (its usage comment uses placeholder paths);
#   - docs/mystic_auth/project-story/ and docker/validation-history.md
#     (history, not the current tree);
#   - tests/scripts/mystic_auth/upstream-sync/test-sync-upstream*.sh (fixture
#     paths live in a temp sandbox repo).
#
# Usage: tests/scripts/mystic_auth/lint/check-script-paths.sh
# Exit 0: every referenced path resolves. Exit 1: some do not, listed.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

SELF="tests/scripts/mystic_auth/lint/check-script-paths.sh"

FILES=()
while IFS= read -r -d '' f; do
  case "$f" in
    "$SELF") continue ;;
    docs/mystic_auth/project-story/*) continue ;;
    docs/mystic_auth/docker/validation-history.md) continue ;;
    tests/scripts/mystic_auth/upstream-sync/test-sync-upstream*.sh) continue ;;
  esac
  FILES+=("$f")
done < <(
  find ci scripts local-scripts tests/scripts docs agent-prompts makefiles -type f \
    \( -name "*.sh" -o -name "*.ps1" -o -name "*.cmd" -o -name "*.bat" -o -name "*.md" -o -name "Makefile" \) \
    -print0
  find . -maxdepth 1 \( -name "*.md" -o -name "Makefile" -o -name "make.ps1" \) -print0
)

MISSING=()

for f in "${FILES[@]}"; do
  while IFS= read -r token; do
    [ -n "$token" ] || continue
#     Only tokens that actually contain a ci/, scripts/, or local-scripts/ path
    # component (forward or backslash) are in scope.
    case "$token" in
      *ci/*|*ci\\*|*scripts/*|*scripts\\*) ;;
      *) continue ;;
    esac
    normalized="${token#./}"
    normalized="${normalized#.\\}"
    normalized="${normalized//\\//}"
    if [ ! -f "$normalized" ]; then
      MISSING+=("$f: $token")
    fi
  done < <(grep -oP '(?<![A-Za-z0-9_$}])[A-Za-z0-9_./\\-]*\.(sh|py|ps1|cmd|bat)' "$f" 2>/dev/null | sort -u)
done

while IFS= read -r -d '' f; do
  while IFS= read -r src; do
    [ -n "$src" ] || continue
    # COPY sources can be a glob (e.g. package*.json); compgen expands it
    # against the real filesystem instead of treating it as a literal path.
    if [ -f "$src" ] || [ -d "$src" ]; then
      continue
    fi
    compgen -G "$src" >/dev/null 2>&1 || MISSING+=("$f: COPY $src")
  done < <(grep -oP '^\s*COPY\s+(?!--from)\K\S+' "$f" 2>/dev/null | sort -u)
done < <(find docker -type f \( -iname "*.Dockerfile" -o -iname "Dockerfile" -o -iname "Dockerfile.*" \) -print0)

# A fresh GitHub checkout invokes CI entry points directly. The filesystem
# mode may look executable in a local WSL working tree while the Git index
# still records 100644, which makes the same command fail after checkout.
NON_EXECUTABLE_SHELL_FILES=()
while IFS= read -r path; do
  [ -n "$path" ] || continue
  NON_EXECUTABLE_SHELL_FILES+=("$path")
done < <(
  git ls-files -s -- '*.sh' \
    | awk '$1 != "100755" { print $4 }'
)

if [ "${#NON_EXECUTABLE_SHELL_FILES[@]}" -ne 0 ]; then
  echo "ERROR: ${#NON_EXECUTABLE_SHELL_FILES[@]} tracked shell script(s) are not executable in the Git index:"
  printf '  %s\n' "${NON_EXECUTABLE_SHELL_FILES[@]}"
  echo
  echo "Run chmod +x on each file, stage the mode change, and re-run this check."
  exit 1
fi

if [ "${#MISSING[@]}" -eq 0 ]; then
  echo "OK: every path reference resolves and every tracked shell script is executable in the Git index."
  exit 0
fi

echo "ERROR: ${#MISSING[@]} dangling script reference(s) found:"
echo
printf '  %s\n' "${MISSING[@]}"
echo
echo "A script or doc points at a path that doesn't exist - likely a stale"
echo "reference left over from a rename/restructure. Fix the path or the"
echo "target, then re-run this check."
exit 1
