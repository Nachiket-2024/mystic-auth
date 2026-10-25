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
if [ -f "$REPO_ROOT/scripts/mystic_auth/upstream-sync/check-alembic-heads.sh" ]; then
  if ! ALEMBIC_LOG="$(bash "$REPO_ROOT/scripts/mystic_auth/upstream-sync/check-alembic-heads.sh" 2>&1)"; then
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

  docker compose -f docker/mystic_auth/compose/docker-compose.dev.yml -f docker/app/compose/docker-compose.dev.yml --env-file env/mystic_auth/.env.dev --env-file env/app/.env.dev up -d --build
  scripts/mystic_auth/docker/dev/backend-exec.sh python -m pytest tests/backend/mystic_auth/unit tests/backend/mystic_auth/integration tests/backend/mystic_auth/security
  # frontend: see docs/mystic_auth/testing/overview.md for the equivalent commands
  # scripts/mystic_auth/docker/dev/backend-exec.sh wraps the two Windows/Git Bash and native-Linux
  # workarounds documented in
  # docs/mystic_auth/docker/dev-workflow.md#running-a-one-off-command-inside-a-container
  # -- safe to use on every platform.
EOF
