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
#   - scripts/upstream-sync/check-alembic-heads.sh: catches this app and
#     upstream both adding a migration on the same fork point, which
#     otherwise stays silent until `alembic upgrade head` fails at deploy time.
#
# Also enables `git rerere`: once a conflict is resolved by hand, git
# reapplies that resolution if the same-shaped conflict recurs, which happens
# often when upstream rewords a comment next to your own edit.
#
# Usage: scripts/upstream-sync/sync-upstream.sh [upstream-url]
#   upstream-url defaults to the original template repo; pass your own fork's
#   URL if you're syncing from somewhere else.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

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

echo ""
echo "Incoming commits from upstream/${UPSTREAM_BRANCH}:"
echo "$INCOMING"
echo ""

read -r -p "Sync these into the current branch now? [y/N] " CONFIRM
case "$CONFIRM" in
  [yY]|[yY][eE][sS]) ;;
  *) echo "Not syncing. Run this script again whenever you're ready."; exit 0 ;;
esac

SYNC_LOG="$(mktemp)"
PATCH_FILE="$(mktemp)"
trap 'rm -f "$SYNC_LOG" "$PATCH_FILE"' EXIT

CONFLICT=0

# What the diff says should change, computed before the apply/merge touches
# anything -- compared against reality afterward to catch a file that
# silently failed to apply despite an overall "success".
if [ -z "$LAST_SYNCED_SHA" ]; then
  # HEAD and upstream/branch are unrelated histories, so a plain `git diff`
  # would list every file that only exists on our side (e.g. this script)
  # as "deleted" -- but the squash-merge doesn't actually delete those, it
  # unions both sides. --diff-filter=ACMR (no D) matches that.
  EXPECTED_FILES="$(git diff --name-only --diff-filter=ACMR HEAD "upstream/${UPSTREAM_BRANCH}" | sort -u)"
else
  EXPECTED_FILES="$(git diff --name-only "$LAST_SYNCED_SHA" "upstream/${UPSTREAM_BRANCH}" | sort -u)"
fi

if [ -z "$LAST_SYNCED_SHA" ]; then
  if ! git merge "upstream/${UPSTREAM_BRANCH}" --squash --allow-unrelated-histories >"$SYNC_LOG" 2>&1; then
    cat "$SYNC_LOG"
    if grep -q "CONFLICT" "$SYNC_LOG"; then
      CONFLICT=1
    else
      exit 1
    fi
  else
    cat "$SYNC_LOG"
  fi
else
  git diff --binary "$LAST_SYNCED_SHA" "upstream/${UPSTREAM_BRANCH}" > "$PATCH_FILE"
  if ! git apply --3way --index "$PATCH_FILE" >"$SYNC_LOG" 2>&1; then
    cat "$SYNC_LOG"
    # `git apply --3way` leaves unmerged index entries for genuine conflicts,
    # same signal a real merge would give -- anything else is a real failure.
    if [ -n "$(git ls-files -u)" ]; then
      CONFLICT=1
    else
      # A hard failure with no conflict markers usually means upstream
      # relocated or deleted a file this app customized (e.g. a whole-file
      # rename like docker-compose*.yml -> docker/compose/*.yml): the patch's
      # delete/create hunk has no matching content on either side to
      # 3-way-merge against, so `git apply` just refuses the whole file
      # instead of leaving something to resolve. Same underlying problem as
      # the "silent partial apply" case below (one file's hunk breaks the
      # apply), but caught here instead because this one fails loudly rather
      # than silently -- so it gets the same "exclude and re-diff" recipe.
      FAILED_PATHS="$(grep -E '^error: ' "$SYNC_LOG" | sed -E 's/^error: ([^:]+):.*/\1/' | sort -u)"
      if [ -n "$FAILED_PATHS" ]; then
        EXCLUDE_ARGS=""
        while IFS= read -r p; do
          EXCLUDE_ARGS="$EXCLUDE_ARGS ':!$p'"
        done <<<"$FAILED_PATHS"
        echo ""
        echo "ERROR: git apply failed outright (no conflict markers) on:"
        echo "$FAILED_PATHS" | sed 's/^/  /'
        echo ""
        echo "This usually means upstream moved or deleted one of these paths (e.g. renamed a file you've customized) and there's nothing on either side for a 3-way merge to reconcile. Nothing has been committed."
        echo "Work around it by re-diffing with the listed path(s) excluded, applying that, then handling the excluded file(s) by hand (diff upstream's old and new location yourself and reapply your customization at the new path):"
        echo "  git diff --binary ${LAST_SYNCED_SHA:-HEAD} upstream/${UPSTREAM_BRANCH} -- .$EXCLUDE_ARGS | git apply --3way --index -"
      fi
      exit 1
    fi
  else
    cat "$SYNC_LOG"
  fi
fi

# Everything that actually shows up as changed: staged (the normal case),
# unstaged (a hunk applying outside the index), and unmerged (a real
# conflict). Any EXPECTED_FILES path missing from all three silently failed
# to apply.
ACTUAL_FILES="$( { git diff --cached --name-only; git diff --name-only; git ls-files -u | cut -f2-; } | sort -u )"
MISSING_FILES="$(comm -23 <(printf '%s\n' "$EXPECTED_FILES") <(printf '%s\n' "$ACTUAL_FILES") | sed '/^$/d')"

if [ -n "$MISSING_FILES" ]; then
  echo ""
  echo "ERROR: the diff said these files should have changed, but none of them show up as changed, staged, or conflicted:"
  echo "$MISSING_FILES" | sed 's/^/  /'
  echo ""
  echo "This is the 'silent partial apply' failure mode -- usually one file in the patch (often a binary file, e.g. a changed screenshot) broke the whole apply without leaving a normal conflict marker behind. Nothing has been committed."
  echo "Work around it by re-diffing with the listed path(s) excluded (':!path' per file), then applying that instead, e.g. for a single file:"
  echo "  git diff --binary ${LAST_SYNCED_SHA:-HEAD} upstream/${UPSTREAM_BRANCH} -- . ':!path/to/the/file' | git apply --3way --index -"
  echo "Then handle the excluded file(s) by hand (e.g. copy the file straight from upstream's working tree)."
  exit 1
fi

# A synced script can land non-executable (mode 100644) on a repo running
# core.filemode=false (the Windows default), since git never diffs a
# mode-only change there. Fixed unconditionally rather than relying on a
# human to notice. Stage 0 only (`$3 == "0"`), so an unresolved conflict is
# left untouched.
MODE_DRIFT_FILES="$(git ls-files -s -- 'scripts/**/*.sh' 2>/dev/null | awk '$1 != "100755" && $3 == "0" { print $NF }')"
if [ -n "$MODE_DRIFT_FILES" ]; then
  echo ""
  echo "Restoring the executable bit on scripts that lost it during this sync:"
  while IFS= read -r f; do
    echo "  $f"
    git update-index --chmod=+x "$f"
  done <<<"$MODE_DRIFT_FILES"
fi

# A clean merge/apply says nothing about whether two migrations now share a
# parent, so check separately regardless of conflict status. `-f` + explicit
# `bash` invocation, not `-x` + direct execution: a missing executable bit
# must fail loud here, not silently skip the check.
ALEMBIC_OK=1
ALEMBIC_LOG=""
if [ -f "$REPO_ROOT/scripts/upstream-sync/check-alembic-heads.sh" ]; then
  if ! ALEMBIC_LOG="$(bash "$REPO_ROOT/scripts/upstream-sync/check-alembic-heads.sh" 2>&1)"; then
    ALEMBIC_OK=0
  fi
fi

# Record the upstream commit this sync brought us to, regardless of which
# path ran or whether it ended clean or conflicted -- resolving a conflict
# by hand still means "we've now incorporated upstream up to this SHA".
echo "$UPSTREAM_SHA" > "$SYNC_STATE_FILE"
git add "$SYNC_STATE_FILE"

if [ "$CONFLICT" -eq 1 ]; then
  echo ""
  echo "Conflicts staged above -- resolve them in your working tree, then:"
  echo "  git add <resolved files>"
  echo "  git commit -m \"Sync upstream template updates (mystic-auth@${UPSTREAM_SHA_SHORT})\""
  echo "(${SYNC_STATE_FILE} is already staged with the new upstream commit -- nothing to do for it.)"
  if [ "$ALEMBIC_OK" -eq 0 ]; then
    echo ""
    echo "Also, once the above is resolved, check the migration history:"
    echo "$ALEMBIC_LOG"
  fi
  exit 1
fi

if [ "$ALEMBIC_OK" -eq 0 ]; then
  echo ""
  echo "$ALEMBIC_LOG"
  echo ""
  echo "Not committing -- resolve the alembic branch above first, then:"
  echo "  git add backend/alembic/versions/<merge migration file>"
  echo "  git commit -m \"Sync upstream template updates (mystic-auth@${UPSTREAM_SHA_SHORT})\""
  echo "(${SYNC_STATE_FILE} and everything else from the sync are already staged -- nothing else to do for them.)"
  exit 1
fi

git commit -m "Sync upstream template updates (mystic-auth@${UPSTREAM_SHA_SHORT})"

cat <<EOF

Synced and committed as a single commit (mystic-auth@${UPSTREAM_SHA_SHORT}).
Your history stays yours -- no upstream commits were imported.

Before trusting this, rebuild and rerun the test suite -- a sync can change
behavior underneath you even when every file merged automatically:

  docker compose -f docker/compose/docker-compose.dev.yml --env-file env/.env up -d --build
  scripts/docker/dev/backend-exec.sh python -m pytest tests/backend/mystic_auth/unit tests/backend/mystic_auth/integration tests/backend/mystic_auth/security
  # frontend: see docs/mystic_auth/testing/overview.md for the equivalent commands
  # scripts/docker/dev/backend-exec.sh wraps the two Windows/Git Bash and native-Linux
  # workarounds documented in
  # docs/mystic_auth/docker/dev-workflow.md#running-a-one-off-command-inside-a-container
  # -- safe to use on every platform.
EOF
