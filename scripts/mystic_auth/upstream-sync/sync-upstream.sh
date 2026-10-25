#!/usr/bin/env bash
# On-demand: pulls in updates from the original mystic-auth template repo.
# Nothing here runs automatically. See
# docs/mystic_auth/template-usage/syncing-upstream/README.md for what conflicts and
# what almost never will.
#
# Two sync strategies, chosen automatically:
#
#   1. First sync ever (no .mystic-auth-sync-state file yet): a whole-tree
#      `git merge --squash --allow-unrelated-histories`, so upstream's own
#      commits never become ancestors of your history.
#   2. Every sync after: an incremental `git diff <last-synced-sha>
#      upstream/branch | git apply --3way`. Squash has no merge-base on
#      unrelated histories so it re-diffs the whole tree every time; the
#      incremental diff has a real baseline, so an untouched file produces
#      zero diff instead of a phantom conflict. `--3way` turns an unclean
#      hunk into a real 3-way merge with conflict markers instead of
#      hard-failing the patch.
#
# Three safety nets run after either strategy, before anything commits:
#   - A "did anything actually change" check: `git apply`/`git merge` can
#     report success while one file (a binary file is the sharpest example)
#     silently fails to apply. Compares the file list the diff says should
#     have changed against what's actually staged/conflicted, and refuses to
#     commit on a mismatch.
#   - An executable-bit self-heal for scripts/**/*.sh (see the comment at
#     that check below for why this runs every sync, not just once).
#   - scripts/mystic_auth/upstream-sync/check-alembic-heads.sh: catches this app and
#     upstream both adding a migration on the same fork point, which
#     otherwise stays silent until `alembic upgrade head` fails at deploy time.
#
# Also enables `git rerere`: once a conflict is resolved by hand, git
# reapplies that resolution if the same-shaped conflict recurs, which happens
# often when upstream rewords a comment next to your own edit.
#
# Usage: scripts/mystic_auth/upstream-sync/sync-upstream.sh [upstream-url]
#   upstream-url defaults to the original template repo; pass your own fork's
#   URL if you're syncing from somewhere else. The review, apply, and finalize
#   stages are kept in sibling files; install or sync this whole directory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

# The three stages are sourced at the end, after the fetch and the ownership
# guard. A checkout that holds only this entry point (for example one restored
# from an older single-file copy) would otherwise fail late with a bare
# "No such file" error, so check for the whole set before touching anything.
MISSING_STAGES=()
for stage in review apply finalize; do
  [ -f "$SCRIPT_DIR/sync-upstream-${stage}.sh" ] || MISSING_STAGES+=("sync-upstream-${stage}.sh")
done
if [ "${#MISSING_STAGES[@]}" -gt 0 ]; then
  echo "ERROR: missing sync stage file(s) beside sync-upstream.sh:" >&2
  printf '  %s\n' "${MISSING_STAGES[@]}" >&2
  echo "Restore the whole scripts/mystic_auth/upstream-sync/ set from the upstream template (entry point plus review, apply, and finalize stages), then rerun." >&2
  exit 1
fi

# The sync uses the existing index as its merge/apply workspace and commits
# that index at the end. Staged downstream work would therefore be swept into
# the sync commit, so fail before fetching or changing anything.
if ! git diff --cached --quiet --ignore-submodules --; then
  echo "ERROR: the Git index contains staged changes." >&2
  echo "Commit or unstage downstream work before running sync-upstream.sh; the sync commit must contain sync changes only." >&2
  exit 1
fi

git config rerere.enabled true

SYNC_STATE_FILE=".mystic-auth-sync-state"
UPSTREAM_URL="${1:-https://github.com/Nachiket-2024/mystic-auth.git}"

if git remote get-url upstream >/dev/null 2>&1; then
  echo "Using existing 'upstream' remote: $(git remote get-url upstream)"
else
  echo "Adding 'upstream' remote: $UPSTREAM_URL"
  git remote add upstream "$UPSTREAM_URL"
fi

echo "Fetching upstream..."
git fetch upstream

# A hiccup on this one metadata call shouldn't abort an otherwise-fine sync,
# so it's not a bare assignment under `set -e` -- fall back to 'main'.
UPSTREAM_BRANCH="$(git remote show upstream 2>/dev/null | sed -n '/HEAD branch/s/.*: //p' || true)"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"

UPSTREAM_SHA="$(git rev-parse "upstream/${UPSTREAM_BRANCH}")"
UPSTREAM_SHA_SHORT="${UPSTREAM_SHA:0:7}"

LAST_SYNCED_SHA=""
if [ -f "$SYNC_STATE_FILE" ]; then
  LAST_SYNCED_SHA="$(cat "$SYNC_STATE_FILE")"
fi

# With a recorded baseline, this is upstream's ancestry since that exact
# commit. Without one (first sync, or upgrading from a pre-state-file
# version), there's nothing to diff from, so this lists upstream's full
# history instead -- same as a first sync.
if [ -n "$LAST_SYNCED_SHA" ]; then
  INCOMING="$(git log "${LAST_SYNCED_SHA}..upstream/${UPSTREAM_BRANCH}" --oneline)"
else
  INCOMING="$(git log "HEAD..upstream/${UPSTREAM_BRANCH}" --oneline)"
fi

if [ -z "$INCOMING" ]; then
  echo "Already up to date with upstream/${UPSTREAM_BRANCH}."
  exit 0
fi

if [ -n "$LAST_SYNCED_SHA" ]; then
  UPSTREAM_PATH_CHANGES="$(git diff --name-status -M "$LAST_SYNCED_SHA" "upstream/${UPSTREAM_BRANCH}")"
else
  UPSTREAM_PATH_CHANGES="$(git diff --name-status -M --diff-filter=ACMR HEAD "upstream/${UPSTREAM_BRANCH}")"
fi

# A fork-owned path must never arrive from upstream. Shared files such as
# backend/app/main.py remain intentionally extend-in-place and are not in this
# list. Blocking here catches an accidental upstream edit before a merge can
# silently overwrite downstream product code.
#
# Reference tests that shipped in an older template may already live under
# tests/**/app/. If the same test path was present in the recorded upstream
# baseline (or in both trees during a first sync), an upstream fix to that
# inherited test is a legitimate template update. Three-way apply still
# exposes downstream customization as a conflict; newly added downstream
# tests remain blocked.
if [ -n "$LAST_SYNCED_SHA" ]; then
  OWNERSHIP_DIFF_BASE="$LAST_SYNCED_SHA"
else
  # Unrelated first-sync histories show consumer-only files as deletions on
  # the upstream side. They are not incoming changes and must not be reported
  # as ownership violations (especially when an app split was stashed).
  OWNERSHIP_DIFF_BASE="HEAD"
fi
APP_OWNED_PATH_CHANGES=()

# The CI split was introduced after some downstream projects already existed.
# Allow the three initial app CI entrypoints to be added once when neither the
# consumer's current tree nor its recorded sync baseline has them. After that
# first adoption, normal app-owned protection applies and upstream cannot edit
# them.
is_ci_app_bootstrap_path() {
  local path="$1"
  case "$path" in
    ci/app/backend.sh|ci/app/frontend.sh|ci/app/frontend-e2e.sh) ;;
    *) return 1 ;;
  esac

  if [ -n "$LAST_SYNCED_SHA" ]; then
    git cat-file -e "${LAST_SYNCED_SHA}:${path}" 2>/dev/null && return 1
  else
    git cat-file -e "HEAD:${path}" 2>/dev/null && return 1
  fi
  return 0
}

while IFS= read -r -d '' changed_path; do

  if [[ "$changed_path" == tests/*/app/* ]]; then
    if [ -n "$LAST_SYNCED_SHA" ]; then
      git cat-file -e "${LAST_SYNCED_SHA}:${changed_path}" 2>/dev/null &&
        git cat-file -e "upstream/${UPSTREAM_BRANCH}:${changed_path}" 2>/dev/null &&
        continue
    else
      git cat-file -e "HEAD:${changed_path}" 2>/dev/null &&
        git cat-file -e "upstream/${UPSTREAM_BRANCH}:${changed_path}" 2>/dev/null &&
        continue
    fi
  fi

  case "$changed_path" in
    backend/app/main.py|backend/app/sdk.py|frontend/src/app/App.tsx|frontend/src/app/sdk.ts)
      continue
      ;;
    frontend/src/app/main.tsx|frontend/src/app/theme.ts)
      # These app-owned shell files may receive comment-only template cleanup.
      # Keep behavior and product changes under the normal app-ownership guard.
      ownership_base="${LAST_SYNCED_SHA:-HEAD}"
      if git cat-file -e "${ownership_base}:${changed_path}" 2>/dev/null \
        && git cat-file -e "upstream/${UPSTREAM_BRANCH}:${changed_path}" 2>/dev/null \
        && git diff --unified=0 "$ownership_base" "upstream/${UPSTREAM_BRANCH}" -- "$changed_path" \
          | awk '
            /^\+\+\+|^---/ { next }
            /^[+-]/ {
              line = substr($0, 2)
              if (line ~ /^[[:space:]]*$/) next
              if (line !~ /^[[:space:]]*(\/\/|\/\*|\*\/|\*)/) invalid = 1
            }
            END { exit invalid ? 1 : 0 }
          '; then
        continue
      fi
      APP_OWNED_PATH_CHANGES+=("$changed_path")
      ;;
    ci/app/*)
      is_ci_app_bootstrap_path "$changed_path" || APP_OWNED_PATH_CHANGES+=("$changed_path")
      ;;
    backend/app/*|frontend/src/app/*|tests/*/app/*|docs/app/*|screenshots/app/*|scripts/app/*|agent-prompts/app/*|local-scripts/app/*|docker/app/*|env/app/*|makefiles/app/*)
      APP_OWNED_PATH_CHANGES+=("$changed_path")
      ;;
  esac
done < <(git diff --name-only -z --diff-filter=ACMR "$OWNERSHIP_DIFF_BASE" "upstream/${UPSTREAM_BRANCH}")
if [ "${#APP_OWNED_PATH_CHANGES[@]}" -gt 0 ]; then
  echo "ERROR: upstream attempted to change downstream-owned paths:" >&2
  printf '  %q\n' "${APP_OWNED_PATH_CHANGES[@]}" >&2
  echo "Resolve the ownership violation upstream before syncing; this script will not apply it." >&2
  exit 1
fi

# Root README/security/contribution files are downstream-owned starting
# points, but upstream's own copies may still improve over time. Preserve the
# downstream copies while allowing unrelated upstream changes to sync; the
# filtered diff below excludes them from both the expected-file check and the
# applied patch.
IGNORED_ROOT_DOC_CHANGES="$(git diff --name-only "$([ -n "$LAST_SYNCED_SHA" ] && echo "$LAST_SYNCED_SHA" || echo HEAD)" "upstream/${UPSTREAM_BRANCH}" -- README.md SECURITY.md CONTRIBUTING.md)"
if [ -n "$IGNORED_ROOT_DOC_CHANGES" ]; then
  echo "Ignoring upstream changes to downstream-owned root docs (local copies preserved):"
  printf '%s\n' "$IGNORED_ROOT_DOC_CHANGES" | sed 's/^/  /'
fi

source "$SCRIPT_DIR/sync-upstream-review.sh"
source "$SCRIPT_DIR/sync-upstream-apply.sh"
source "$SCRIPT_DIR/sync-upstream-finalize.sh"
