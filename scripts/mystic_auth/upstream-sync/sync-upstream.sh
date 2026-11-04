#!/usr/bin/env bash
# On-demand: pulls updates from the original mystic-auth template repo into
# this project. Nothing here runs automatically. See
# docs/mystic_auth/template-usage/syncing-upstream/README.md.
#
# Strategy is chosen automatically:
#   1. First sync (no .mystic-auth-sync-state yet): `git merge --squash
#      --allow-unrelated-histories`, so upstream's commits never enter your
#      history.
#   2. Later syncs: `git diff <last-synced-sha> upstream/branch | git apply
#      --3way`. The recorded baseline means an untouched file produces no diff,
#      and an unclean hunk becomes a real conflict marker instead of a failure.
#
# Checks before anything commits:
#   - Applied files must match the diff's file list (`git apply` can silently
#     skip a file, binaries especially).
#   - Executable bit is restored on scripts/**/*.sh.
#   - check-alembic-heads.sh catches two migration heads on one fork point.
#
# `git rerere` is enabled so a conflict resolved once is reused when the same
# shape recurs (for example upstream rewording a comment next to your edit).
#
# Ownership guard: upstream edits to app-owned paths block the sync, except
# seeded starter files (app_sdk.*, models.py, main.tsx, theme.ts, app READMEs,
# env/app examples, starter legal/ and status_pages/ components), which merge
# three-way once they are in the recorded baseline.
#
# Usage: scripts/mystic_auth/upstream-sync/sync-upstream.sh [--commit | --abort] [upstream-url]
#   upstream-url defaults to the original template repo. The review, apply and
#   finalize stages are sibling files; keep the whole directory together.

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

SYNC_STATE_FILE=".mystic-auth-sync-state"
SYNC_TOOLS_DIR="scripts/mystic_auth/upstream-sync"

# Options:
#   --commit  also create the sync commit. By default the sync only stages its
#             result and you review and commit it yourself.
#   --abort   abandon an unfinished sync (asks first, explains exactly what it
#             will do; see abort_pending_sync below).
ABORT=0
COMMIT_SYNC="${MYSTIC_AUTH_SYNC_COMMIT:-0}"
UPSTREAM_URL_ARG=""
for arg in "$@"; do
  case "$arg" in
    --abort) ABORT=1 ;;
    --commit) COMMIT_SYNC=1 ;;
    -*)
      echo "ERROR: unknown option '$arg'. Supported: --commit, --abort." >&2
      exit 2
      ;;
    *) UPSTREAM_URL_ARG="$arg" ;;
  esac
done

# Helpers that avoid early-exiting pipes. `cmd | grep -q` or `cmd | head -n 1`
# can make `cmd` die of SIGPIPE, which fails the whole pipeline under
# pipefail at random (more often with many staged files or several stashes).
# Read the output first and match with `case` instead.
index_has_staged_path() {
  local list
  list="$(git diff --cached --name-only)"
  case $'\n'"$list"$'\n' in
    *$'\n'"$1"$'\n'*) return 0 ;;
  esac
  return 1
}
# Prints the ref (for example stash@{0}) of the newest stash whose message
# contains the given text; returns 1 if there is none.
find_stash_ref_by_name() {
  local ref msg
  while IFS=$'\t' read -r ref msg; do
    case "$msg" in
      *"$1"*) printf '%s' "$ref"; return 0 ;;
    esac
  done < <(git stash list --format='%gd%x09%gs')
  return 1
}

# Abandon an unfinished sync. This is destructive, so it first explains in
# plain words exactly what it will do and what you lose, and only continues
# when the word "abandon" is typed. A piped "yes" is deliberately not enough.
abort_pending_sync() {
  local unmerged state_staged stash_ref f
  unmerged="$(git ls-files -u | cut -f2- | sort -u)"
  state_staged=0
  if index_has_staged_path "$SYNC_STATE_FILE"; then
    state_staged=1
  fi
  stash_ref="$(find_stash_ref_by_name mystic-auth-sync-worktree- || true)"

  # Only act on something that is recognisably a sync. Staged work of your own
  # is not a sync and is never touched here.
  if [ -z "$unmerged" ] && [ "$state_staged" -eq 0 ] \
    && { [ -z "$stash_ref" ] || git diff --cached --quiet --ignore-submodules --; }; then
    echo "Nothing to abandon: no unfinished sync was found in this project."
    echo "(Anything you have staged yourself is not a sync, so it is left alone.)"
    exit 1
  fi

  local added=() tracked_changes
  # A=added, R/C=the new path of a rename or copy: all files the sync created.
  while IFS= read -r -d '' f; do
    case "$f" in "$SYNC_TOOLS_DIR"/*) continue ;; esac
    added+=("$f")
  done < <(git diff --cached --name-only --diff-filter=ARC -z)
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in "$SYNC_TOOLS_DIR"/*) continue ;; esac
    git cat-file -e "HEAD:${f}" 2>/dev/null || added+=("$f")
  done <<< "$unmerged"
  tracked_changes="$(git diff HEAD --name-only -- . ":!${SYNC_TOOLS_DIR}" | sed '/^$/d' | sort -u | wc -l | tr -d ' ')"

  echo "You asked to abandon the sync that is currently unfinished in this project."
  echo ""
  echo "What this will DO:"
  echo "  1. Unstage everything the sync staged."
  echo "  2. Put ${tracked_changes} file(s) back exactly as they are in your last commit"
  echo "     (the sync changed them, so this undoes the sync's edits, including any"
  echo "     conflict fixes you already made in them)."
  echo "  3. Delete ${#added[@]} new file(s) that the sync added."
  if [ -n "$stash_ref" ]; then
    echo "  4. Bring back your own work that the sync saved aside earlier ($stash_ref),"
    echo "     then remove that saved copy."
  else
    echo "  4. (No saved work from the sync was found, so there is nothing to bring back.)"
  fi
  echo ""
  echo "What this will NOT touch:"
  echo "  - Your commits and history."
  echo "  - Files Git ignores, such as your real .env files."
  echo "  - The sync tools folder (${SYNC_TOOLS_DIR}), so the latest tools stay in place."
  echo ""
  echo "What you LOSE: the sync's partial result, and any edits you made on top of it"
  echo "in the files listed above. After this you can run the sync again from the start."
  if [ "${#added[@]}" -gt 0 ]; then
    echo ""
    echo "New files that will be deleted (first 20):"
    printf '  %s\n' "${added[@]:0:20}"
  fi
  echo ""
  printf 'To go ahead, type exactly "abandon" and press Enter (anything else cancels): '
  local answer=""
  read -r answer || answer=""
  if [ "$answer" != "abandon" ]; then
    echo "Cancelled. Nothing was changed."
    exit 1
  fi

  git reset -q
  git restore --source=HEAD --worktree -- . ":!${SYNC_TOOLS_DIR}"
  for f in "${added[@]}"; do
    rm -f -- "$f"
    rmdir -p --ignore-fail-on-non-empty -- "$(dirname -- "$f")" 2>/dev/null || true
  done
  echo ""
  echo "The unfinished sync was abandoned."
  if [ -n "$stash_ref" ]; then
    if git stash pop "$stash_ref"; then
      echo "Your saved work was brought back."
    else
      echo "WARNING: your saved work could not be brought back automatically." >&2
      echo "It is still safe in the stash ($stash_ref). Run 'git stash show -p $stash_ref' to look at it." >&2
      exit 1
    fi
  fi
  echo "You can now run the sync again."
  exit 0
}

if [ "$ABORT" -eq 1 ]; then
  abort_pending_sync
fi

# A leftover half-finished sync blocks a new one. Explain why in plain words
# instead of just refusing.
if [ -n "$(git ls-files -u)" ] || index_has_staged_path "$SYNC_STATE_FILE"; then
  echo "ERROR: an earlier sync in this project is unfinished (it left staged or conflicted files)." >&2
  echo "Starting another sync on top of it would mix the two." >&2
  echo "Either finish it (resolve the conflicts, run the checks, commit), or abandon it with:" >&2
  echo "  scripts/mystic_auth/upstream-sync/sync-upstream.sh --abort" >&2
  echo "--abort explains exactly what it will undo and asks before doing anything." >&2
  exit 1
fi

# The sync uses the existing index as its merge/apply workspace. Staged
# downstream work would be mixed into the sync result, so fail before fetching
# or changing anything.
if ! git diff --cached --quiet --ignore-submodules --; then
  echo "ERROR: the Git index contains staged changes." >&2
  echo "Commit or unstage your own work before running sync-upstream.sh, so the sync result contains sync changes only." >&2
  exit 1
fi

git config rerere.enabled true

UPSTREAM_URL="${UPSTREAM_URL_ARG:-https://github.com/Nachiket-2024/mystic-auth.git}"

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

# This script and its stage files must be the latest upstream versions: an
# older copy can carry an outdated ownership guard or safeguards that block a
# sync the latest tools would allow. The tools cannot safely replace
# themselves while running, so stop and say exactly how to refresh them.
STALE_TOOL_FILES=()
while IFS= read -r -d '' tool_path; do
  upstream_blob="$(git rev-parse "upstream/${UPSTREAM_BRANCH}:${tool_path}" 2>/dev/null || true)"
  local_blob=""
  [ -f "$tool_path" ] && local_blob="$(git hash-object -- "$tool_path")"
  [ "$upstream_blob" = "$local_blob" ] || STALE_TOOL_FILES+=("$tool_path")
done < <(git ls-tree -r --name-only -z "upstream/${UPSTREAM_BRANCH}" -- "$SYNC_TOOLS_DIR")
if [ "${#STALE_TOOL_FILES[@]}" -gt 0 ]; then
  echo "ERROR: the sync tools in this project are not the latest upstream versions:" >&2
  printf '  %s\n' "${STALE_TOOL_FILES[@]}" >&2
  echo "Older tools can block or mishandle a sync that the latest tools handle correctly." >&2
  echo "Refresh them, then run this command again (this only replaces the tools folder; nothing is committed):" >&2
  echo "  git restore --source=upstream/${UPSTREAM_BRANCH} --worktree -- ${SYNC_TOOLS_DIR}/" >&2
  exit 1
fi

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
# Seeded files upstream newly added that the project already has its own copy
# of: excluded from the patch (the project's copy stays), and reported below.
KEEP_LOCAL_PATHSPECS=()
KEEP_LOCAL_PATHS=()

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
      # Named template reference tests (they guard the app/mystic_auth
      # boundary) may be added once when the project has neither a baseline
      # copy nor its own file at that path. Any other new path under
      # tests/**/app/ stays blocked so an accidental upstream test cannot land.
      case "$changed_path" in
        tests/backend/app/test_app_extension_points_unit.py|tests/frontend/app/app_import_boundary.test.ts|tests/frontend/app/legal/legal_policy_parity.test.ts)
          git cat-file -e "${LAST_SYNCED_SHA}:${changed_path}" 2>/dev/null ||
            git cat-file -e "HEAD:${changed_path}" 2>/dev/null ||
            continue
          ;;
      esac
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
    backend/app/app_sdk.py|backend/app/models.py|frontend/src/app/app_sdk.ts|frontend/src/app/main.tsx|frontend/src/app/theme.ts|\
    agent-prompts/app/README.md|docker/app/*/README.md|local-scripts/app/README.md|scripts/app/README.md|\
    env/app/.env*.example|frontend/src/app/legal/*|frontend/src/app/status_pages/*|scripts/app/env-tools/*.example)
      # Files the template seeds once and later fixes (a docstring, a README
      # correction, a bootstrap import, an env example line, a status page
      # fix). Once the file is in the recorded baseline, take upstream's edit
      # through the normal three-way apply: an untouched copy updates cleanly,
      # a customized copy surfaces as a real conflict instead of being
      # overwritten. The agent then decides per conflict (take a needed fix,
      # keep a customization). Without a baseline (first sync) keep them under
      # the normal app-ownership guard.
      if [ -n "$LAST_SYNCED_SHA" ] \
        && git cat-file -e "${LAST_SYNCED_SHA}:${changed_path}" 2>/dev/null \
        && git cat-file -e "upstream/${UPSTREAM_BRANCH}:${changed_path}" 2>/dev/null; then
        continue
      fi
      # backend/app/models.py was seeded upstream after some projects already
      # had their own. When it is newly added (not in the baseline): if the
      # project has no such file, adding it overwrites nothing; if it already
      # has its own copy, keep it and leave the upstream seed out of the
      # patch. Any other new path under an app folder stays blocked.
      if [ "$changed_path" = "backend/app/models.py" ] \
        && [ -n "$LAST_SYNCED_SHA" ] \
        && ! git cat-file -e "${LAST_SYNCED_SHA}:${changed_path}" 2>/dev/null; then
        if ! git cat-file -e "HEAD:${changed_path}" 2>/dev/null; then
          continue
        fi
        KEEP_LOCAL_PATHSPECS+=(":!${changed_path}")
        KEEP_LOCAL_PATHS+=("$changed_path")
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
if [ "${#KEEP_LOCAL_PATHS[@]}" -gt 0 ]; then
  echo "Keeping the project's own copy of newly seeded upstream file(s) (not applied):"
  printf '  %s\n' "${KEEP_LOCAL_PATHS[@]}"
  echo "Compare them with upstream/${UPSTREAM_BRANCH} yourself if you want any new starter content."
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
