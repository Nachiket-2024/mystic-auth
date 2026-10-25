echo ""
echo "Incoming commits from upstream/${UPSTREAM_BRANCH}:"
echo "$INCOMING"
echo ""

REMOVAL_OR_RENAME_CHANGES="$(printf '%s\n' "$UPSTREAM_PATH_CHANGES" | awk '$1 == "D" || $1 ~ /^R[0-9]+$/')"
if [ -n "$REMOVAL_OR_RENAME_CHANGES" ]; then
  echo "Upstream file removals/renames in this sync (old paths will not be kept):"
  printf '%s\n' "$REMOVAL_OR_RENAME_CHANGES" | while IFS= read -r change; do
    case "$change" in
      D$'\t'*) printf '  DELETE %s\n' "${change#*$'\t'}" ;;
      R*$'\t'*)
        old_path="${change#*$'\t'}"
        new_path="${old_path#*$'\t'}"
        old_path="${old_path%%$'\t'*}"
        printf '  MOVE   %s -> %s\n' "$old_path" "$new_path"
        ;;
    esac
  done
  echo "These upstream-owned paths are included in the sync and will be removed or moved as shown."
  echo "The ownership split normally keeps app-owned paths out of upstream changes; inspect any app-owned path if one appears unexpectedly."
  echo ""
fi

# A normal 3-way patch is the wrong primitive for an upstream-owned rename or
# deletion: git apply can require the old path to exist in the consumer index,
# even when the consumer already removed it locally. Handle these structural
# changes from the upstream tree after applying the ordinary patch. The
# ownership guard above has already rejected app-owned paths; root docs are
# intentionally preserved and therefore stay in the ordinary exclusion list.
STRUCTURAL_PATH_ARGS=()
if [ -n "$LAST_SYNCED_SHA" ]; then
  while IFS=$'\t' read -r change_status old_path new_path; do
    [ -n "$change_status" ] || continue
    case "$change_status" in
      D)
        structural_path="$old_path"
        ;;
      R[0-9]*)
        structural_path="$old_path"
        ;;
      *)
        continue
        ;;
    esac
    case "$structural_path" in
      README.md|SECURITY.md|CONTRIBUTING.md) continue ;;
    esac
    if [[ "$change_status" == D ]] \
      && git ls-files --error-unmatch -- "$old_path" >/dev/null 2>&1 \
      && ! git diff --quiet "$LAST_SYNCED_SHA" -- "$old_path"; then
      # A locally modified deletion must remain on the normal patch path so
      # git can surface a conflict instead of silently discarding the edit.
      continue
    fi
    # If the old rename source still exists in the consumer index, let the
    # normal 3-way apply surface a conflict/hard failure so local edits cannot
    # be overwritten implicitly. Direct handling is only for a source path
    # that is already absent, the case git apply cannot represent reliably.
    if [[ "$change_status" == R* ]] && git ls-files --error-unmatch -- "$old_path" >/dev/null 2>&1; then
      continue
    fi
    STRUCTURAL_PATH_ARGS+=(":!$structural_path")
    if [[ "$change_status" == R* ]]; then
      case "$new_path" in
        README.md|SECURITY.md|CONTRIBUTING.md) continue ;;
      esac
      STRUCTURAL_PATH_ARGS+=(":!$new_path")
    fi
  done <<< "$UPSTREAM_PATH_CHANGES"
fi

read -r -p "Sync these into the current branch now? [y/N] " CONFIRM
case "$CONFIRM" in
  [yY]|[yY][eE][sS]) ;;
  *) echo "Not syncing. Run this script again whenever you're ready."; exit 0 ;;
esac
