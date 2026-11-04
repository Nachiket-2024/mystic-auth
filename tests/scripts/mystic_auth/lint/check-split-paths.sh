#!/usr/bin/env bash
# Regression guard: docker/, env/ and scripts/ were each split into mystic_auth/
# + app/ subfolders, and comments, docs and scripts that build a path at runtime
# kept the old unsplit location, silently breaking real workflows (alembic, a
# Playwright helper, pytest's localhost derivation).
#
# check-script-paths.sh validates literal script paths. This script covers what
# it cannot: pre-split path substrings (env/.env, docker/compose/,
# docker/dockerfiles/, docker/postgres-init/, docker/Caddyfile,
# docker/nginx.frontend.conf) anywhere in source, scripts or docs, which have no
# checkable file extension, so a denylist is used.
#
# Excluded on purpose:
#   - this file (its pattern list contains the strings);
#   - docs/mystic_auth/project-story/ and docker/validation-history.md
#     (history describes paths as they were);
#   - tests/scripts/mystic_auth/upstream-sync/test-sync-upstream*.sh (fixture
#     repos use pre-split paths to simulate an old template);
#   - check-script-paths.sh (its header names the old paths as history).
#
# Usage: tests/scripts/mystic_auth/lint/check-split-paths.sh
# Exit 0: no pre-split path found. Exit 1: found, listed.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

SELF="tests/scripts/mystic_auth/lint/check-split-paths.sh"

# Order matters for readability in output only. grep -F below treats each
# as a literal string, not a pattern.
PATTERNS=(
  'env/.env'
  'docker/compose/'
  'docker/dockerfiles/'
  'docker/postgres-init/'
  'docker/Caddyfile'
  'docker/nginx.frontend.conf'
  'scripts/env-tools/'
  'scripts/docker/'
  'scripts/upstream-sync/'
  'scripts/db/'
  'scripts/load-test/'
)

# git ls-files (tracked + untracked-but-not-ignored), not find: skips
# gitignored files (a personal agent-notes file, generated
# env/mystic_auth/.env.dev, etc.) that aren't part of what actually ships,
# and would otherwise show up as false positives, while still covering a
# file that's new on disk but not committed yet.
FILES=()
while IFS= read -r f; do
  case "$f" in
    "$SELF") continue ;;
    docs/mystic_auth/project-story/*) continue ;;
    docs/mystic_auth/docker/validation-history.md) continue ;;
    tests/scripts/mystic_auth/upstream-sync/test-sync-upstream*.sh) continue ;;
    tests/scripts/mystic_auth/lint/check-script-paths.sh) continue ;;
    *.py|*.ts|*.tsx|*.sh|*.ps1|*.cmd|*.bat|*.md|*.yml|*.yaml) FILES+=("$f") ;;
    */Makefile|Makefile) FILES+=("$f") ;;
  esac
done < <(git ls-files --cached --others --exclude-standard)

HITS=()

for f in "${FILES[@]}"; do
  for pattern in "${PATTERNS[@]}"; do
    # -F: literal string, not regex. env/.env would otherwise also match
    # env/mystic_auth/.env.dev via the "." wildcard if treated as a regex.
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      # A real "env/mystic_auth/.env.dev" or "env/app/.env.dev" substring contains
      # "env/.env" only as a false positive of the plain-string search
      # above when "mystic_auth/.env" or "app/.env" is what's actually
      # there - filter those back out here.
      if [ "$pattern" = "env/.env" ]; then
        case "$line" in
          *env/mystic_auth/.env*|*env/app/.env*) continue ;;
        esac
      fi
      HITS+=("$f: $pattern")
      break
    done < <(grep -F "$pattern" "$f" 2>/dev/null)
  done
done

if [ "${#HITS[@]}" -eq 0 ]; then
  echo "OK: no pre-split docker/env/scripts path reference found."
  exit 0
fi

echo "ERROR: ${#HITS[@]} pre-split path reference(s) found:"
echo
printf '  %s\n' "${HITS[@]}"
echo
echo "docker/, env/, and scripts/ each split into mystic_auth/ + app/"
echo "subfolders. A reference above still points at the old unsplit"
echo "location - update it, or add it to this script's excluded-files"
echo "list if it's deliberately historical."
exit 1
