SYNC_LOG="$(mktemp)"
PATCH_FILE="$(mktemp)"
CONFLICT=0
WORKTREE_STASH_CREATED=0
WORKTREE_STASH_NAME=""

restore_worktree_stash() {
  [ "$WORKTREE_STASH_CREATED" -eq 1 ] || return 0
  echo "Restoring downstream work saved before the sync..."
  if git stash pop; then
    WORKTREE_STASH_CREATED=0
  else
    echo "ERROR: the sync commit succeeded, but the saved downstream work could not be restored cleanly." >&2
    echo "Resolve the restore conflict, then remove the retained stash with: git stash drop" >&2
    return 1
  fi
}

cleanup() {
  local exit_status=$?
  if ! restore_worktree_stash; then
    exit_status=1
  fi
  rm -f "$SYNC_LOG" "$PATCH_FILE"
  exit "$exit_status"
}
trap cleanup EXIT

# What the diff says should change, computed before the apply/merge touches
# anything -- compared against reality afterward to catch a file that
# silently failed to apply despite an overall "success".
if [ -z "$LAST_SYNCED_SHA" ]; then
  # HEAD and upstream/branch are unrelated histories, so a plain `git diff`
  # would list every file that only exists on our side (e.g. this script)
  # as "deleted" -- but the squash-merge doesn't actually delete those, it
  # unions both sides. --diff-filter=ACMR (no D) matches that.
  EXPECTED_FILES="$(git diff --name-only --diff-filter=ACMR HEAD "upstream/${UPSTREAM_BRANCH}" -- . ':!README.md' ':!SECURITY.md' ':!CONTRIBUTING.md' | sort -u)"
else
  EXPECTED_FILES="$(git diff --name-only "$LAST_SYNCED_SHA" "upstream/${UPSTREAM_BRANCH}" -- . ':!README.md' ':!SECURITY.md' ':!CONTRIBUTING.md' "${STRUCTURAL_PATH_ARGS[@]}" | sort -u)"
fi

# The index must be clean because the sync commits it, but downstream users
# often have an app split in the working tree during their first sync. A
# squash merge cannot use HEAD as its index baseline while those unstaged
# deletions or untracked app files are present. Save that work temporarily,
# including untracked app files, apply upstream against a clean tree, then
# restore it after the sync commit. Ignored files such as real env files are
# deliberately excluded from the stash.
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  WORKTREE_STASH_NAME="mystic-auth-sync-worktree-$(date +%s)"
  echo "Saving unstaged downstream work while applying the sync: $WORKTREE_STASH_NAME"
  git stash push --include-untracked --message "$WORKTREE_STASH_NAME" >/dev/null
  WORKTREE_STASH_CREATED=1
fi

# A downstream app split can also have removed an upstream-owned path in a
# committed change. In that case the working tree stash is not enough: the
# three-way apply still needs the path's last upstream version in the index.
# Recreate only missing paths that exist in the recorded upstream baseline.
# New files need no base, and structural deletes or renames are handled by
# the direct tree operation below.
if [ -n "$LAST_SYNCED_SHA" ]; then
  while IFS=$'\t' read -r change_status old_path new_path; do
    [ -n "$change_status" ] || continue
    case "$change_status" in
      M|M[0-9]*|C[0-9]*) baseline_path="$old_path" ;;
      *) continue ;;
    esac
    case "$baseline_path" in
      README.md|SECURITY.md|CONTRIBUTING.md) continue ;;
    esac
    if ! git ls-files --error-unmatch -- "$baseline_path" >/dev/null 2>&1 \
      && git cat-file -e "${LAST_SYNCED_SHA}:${baseline_path}" 2>/dev/null; then
      echo "Restoring missing upstream baseline path for three-way apply: $baseline_path"
      git restore --source="$LAST_SYNCED_SHA" --staged --worktree -- "$baseline_path"
    fi
  done <<< "$UPSTREAM_PATH_CHANGES"
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
  git diff --binary "$LAST_SYNCED_SHA" "upstream/${UPSTREAM_BRANCH}" -- . ':!README.md' ':!SECURITY.md' ':!CONTRIBUTING.md' "${STRUCTURAL_PATH_ARGS[@]}" > "$PATCH_FILE"
  if ! git apply --3way --index "$PATCH_FILE" >"$SYNC_LOG" 2>&1; then
    cat "$SYNC_LOG"
    # `git apply --3way` leaves unmerged index entries for genuine conflicts,
    # same signal a real merge would give -- anything else is a real failure.
    if [ -n "$(git ls-files -u)" ]; then
      CONFLICT=1
    else
      # A hard failure with no conflict markers usually means upstream
      # relocated or deleted a file this app customized (e.g. a whole-file
      # rename like docker-compose*.yml -> docker/mystic_auth/compose/*.yml):
      # the patch's
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

if [ -n "$LAST_SYNCED_SHA" ] && [ "${#STRUCTURAL_PATH_ARGS[@]}" -gt 0 ]; then
  echo "Applying upstream-owned removals/renames directly from upstream..."
  while IFS=$'\t' read -r change_status old_path new_path; do
    [ -n "$change_status" ] || continue
    case "$change_status" in
      D)
        case "$old_path" in
          README.md|SECURITY.md|CONTRIBUTING.md) continue ;;
        esac
        if git ls-files --error-unmatch -- "$old_path" >/dev/null 2>&1 \
          && ! git diff --quiet "$LAST_SYNCED_SHA" -- "$old_path"; then
          continue
        fi
        echo "  DELETE $old_path"
        git rm -f --ignore-unmatch -- "$old_path"
        ;;
      R[0-9]*)
        case "$old_path:$new_path" in
          README.md:*|SECURITY.md:*|CONTRIBUTING.md:*) continue ;;
          *:README.md|*:SECURITY.md|*:CONTRIBUTING.md) continue ;;
        esac
        if git ls-files --error-unmatch -- "$old_path" >/dev/null 2>&1; then
          continue
        fi
        echo "  MOVE   $old_path -> $new_path"
        git restore --source="upstream/${UPSTREAM_BRANCH}" --staged --worktree -- "$new_path"
        git rm -f --ignore-unmatch -- "$old_path"
        ;;
    esac
  done <<< "$UPSTREAM_PATH_CHANGES"
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
