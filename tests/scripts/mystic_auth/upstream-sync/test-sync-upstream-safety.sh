echo "=== Transition scenario: old-script user (prior sync commit, but no state file) ==="
cd "$BASE"
mkdir old-consumer && cd old-consumer
git init -q -b main
git config user.email old@test.com; git config user.name OldConsumer
cp -r "$BASE/upstream/mystic_auth" .
cp -r "$BASE/upstream/app" .
cp "$BASE/upstream/README.md" .
git add -A && git commit -q -m "Initial commit from template"
install_script "$BASE/old-consumer"
git add -A && git commit -q -m "Sync upstream template updates (mystic-auth@oldsha)" --allow-empty
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/upstream" >/dev/null 2>&1 || true
[ -f .mystic-auth-sync-state ] || fail "transition: state file not created on upgrade"
pass "transition: old-script user with no state file falls back to squash path safely"

echo ""
echo "=== rerere: confirm sync-upstream.sh turns it on for the consumer repo ==="
cd "$BASE/consumer"
[ "$(git config --get rerere.enabled)" = "true" ] || fail "rerere: not enabled after running sync-upstream.sh"
pass "rerere: enabled by sync-upstream.sh"

echo ""
echo "=== Silent partial-apply guard: git-apply-succeeds-but-nothing-changed should be caught, not committed ==="
cd "$BASE"
mkdir shim-upstream && cd shim-upstream
git init -q -b main
git config user.email up@test.com; git config user.name Upstream
mkdir -p mystic_auth app
echo "core v1" > mystic_auth/core.py
echo "app v1" > app/main.py
git add -A && git commit -q -m "shim upstream base"
cd "$BASE"
mkdir shim-consumer && cd shim-consumer
git init -q -b main
git config user.email me@test.com; git config user.name Consumer
cp -r "$BASE/shim-upstream/mystic_auth" .
cp -r "$BASE/shim-upstream/app" .
git add -A && git commit -q -m "Initial commit from template"
install_script "$BASE/shim-consumer"
git add -A && git commit -q -m "Add sync script"
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/shim-upstream" >/dev/null 2>&1 || true
BASELINE_COMMIT="$(git rev-parse HEAD)"

cd "$BASE/shim-upstream"
echo "core v2 -- upstream really did change this file" > mystic_auth/core.py
git add -A && git commit -q -m "shim upstream release 2"
cd "$BASE/shim-consumer"

# Fake `git` ahead of the real one on PATH: passes every subcommand through
# except `apply`, which reports success without touching anything --
# simulating a clean-looking apply that silently dropped a file (in the
# real world, usually a binary one).
REAL_GIT="$(command -v git)"
mkdir -p "$BASE/fake-bin"
cat > "$BASE/fake-bin/git" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "apply" ]; then
  echo "Applied patch to 'mystic_auth/core.py' cleanly."
  exit 0
fi
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$BASE/fake-bin/git"

set +e
yes | env PATH="$BASE/fake-bin:$PATH" ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/shim-upstream" >/tmp/shim-sync.log 2>&1
SHIM_EXIT=$?
set -e

grep -q "silent partial apply" /tmp/shim-sync.log || fail "silent-apply guard: didn't detect the fake no-op apply"
pass "silent-apply guard: detected the reported-success-but-nothing-changed case"
[ "$SHIM_EXIT" -ne 0 ] || fail "silent-apply guard: script should have exited non-zero"
pass "silent-apply guard: script exits non-zero"
[ "$(git rev-parse HEAD)" = "$BASELINE_COMMIT" ] || fail "silent-apply guard: a commit landed despite the guard firing"
pass "silent-apply guard: no bogus commit landed"
[ "$(cat mystic_auth/core.py)" = "core v1" ] || fail "silent-apply guard: working tree shouldn't have moved"
pass "silent-apply guard: working tree untouched"

echo "=== Worktree-restore failure: keep the sync commit and retained stash ==="
mkdir -p backend/app
echo "downstream work awaiting restoration" > backend/app/restore_pending.py
RESTORE_BASELINE="$(git rev-parse HEAD)"
mkdir -p "$BASE/restore-fake-bin"
cat > "$BASE/restore-fake-bin/git" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "stash" ] && [ "\$2" = "pop" ]; then
  echo "simulated stash restore failure" >&2
  exit 1
fi
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$BASE/restore-fake-bin/git"
set +e
yes | env PATH="$BASE/restore-fake-bin:$PATH" ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/shim-upstream" >/tmp/restore-sync.log 2>&1
RESTORE_EXIT=${PIPESTATUS[1]}
set -e
[ "$RESTORE_EXIT" -ne 0 ] || fail "worktree restore: sync hid the restore failure"
grep -q "saved downstream work could not be restored cleanly" /tmp/restore-sync.log || fail "worktree restore: failure was not actionable"
pass "worktree restore: sync returned non-zero with actionable recovery"
[ "$(git rev-parse HEAD)" != "$RESTORE_BASELINE" ] || fail "worktree restore: successful sync commit was lost"
pass "worktree restore: sync commit was retained"
[ -n "$(git stash list)" ] || fail "worktree restore: failed restore did not retain the stash"
pass "worktree restore: failed restore retained the stash"
git stash drop >/dev/null
rm -f /tmp/restore-sync.log

echo ""
echo "=== Alembic branch-detection: template and app both add a migration on the same fork point ==="
cd "$BASE"
mkdir alembic-upstream && cd alembic-upstream
git init -q -b main
git config user.email up@test.com; git config user.name Upstream
make_migration backend/alembic/versions aaa000000001 None "init"
git add -A && git commit -q -m "upstream: init migration"
cd "$BASE"
mkdir alembic-consumer && cd alembic-consumer
git init -q -b main
git config user.email me@test.com; git config user.name Consumer
cp -r "$BASE/alembic-upstream/backend" .
git add -A && git commit -q -m "Initial commit from template"
install_script "$BASE/alembic-consumer"
git add -A && git commit -q -m "Add sync script"
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/alembic-upstream" >/dev/null 2>&1 || true

# Consumer adds their own migration on top of the current (single) head.
make_migration backend/alembic/versions bbb000000002 aaa000000001 "add my table"
git add -A && git commit -q -m "my own migration"

# Upstream, independently, also ships a migration on top of that same head --
# the two-heads scenario nothing in a naive sync flow would catch.
cd "$BASE/alembic-upstream"
make_migration backend/alembic/versions ccc000000003 aaa000000001 "upstream migration"
git add -A && git commit -q -m "upstream: another migration on the same head"
cd "$BASE/alembic-consumer"

set +e
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/alembic-upstream" >/tmp/alembic-sync.log 2>&1
ALEMBIC_SYNC_EXIT=$?
set -e

grep -q "multiple alembic heads" /tmp/alembic-sync.log || fail "alembic-heads: sync didn't report the branched migration history"
pass "alembic-heads: sync reports the branched migration history"
[ "$ALEMBIC_SYNC_EXIT" -ne 0 ] || fail "alembic-heads: sync should have exited non-zero instead of auto-committing"
pass "alembic-heads: sync exits non-zero instead of auto-committing"
git log --oneline -1 | grep -q "my own migration" || fail "alembic-heads: sync committed on top of the branch without a merge migration"
pass "alembic-heads: no auto-commit landed on top of the unresolved branch"
git diff --cached --name-only | grep -q ".mystic-auth-sync-state" || fail "alembic-heads: state file not staged despite blocking the commit"
pass "alembic-heads: state file still staged so a manual commit after the fix needs no extra step"

echo ""
echo "=== Executable-bit self-heal: a scripts/**/*.sh landing non-executable after a sync should get auto-fixed ==="
cd "$BASE"
mkdir mode-upstream && cd mode-upstream
git init -q -b main
git config user.email up@test.com; git config user.name Upstream
mkdir -p mystic_auth app
echo "core v1" > mystic_auth/core.py
git add -A && git commit -q -m "mode-upstream base"
cd "$BASE"
mkdir mode-consumer && cd mode-consumer
git init -q -b main
git config user.email me@test.com; git config user.name Consumer
cp -r "$BASE/mode-upstream/mystic_auth" .
cp -r "$BASE/mode-upstream/app" .
git add -A && git commit -q -m "Initial commit from template"
install_script "$BASE/mode-consumer"
git add -A && git commit -q -m "Add sync script"
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/mode-upstream" >/dev/null 2>&1 || true

# Upstream ships a new script committed non-executable (someone forgot
# `chmod +x`) -- a stand-in for whatever mechanism causes the drift
# downstream; the self-heal step doesn't care which one it was.
cd "$BASE/mode-upstream"
mkdir -p scripts/docker
printf '#!/usr/bin/env bash\necho hi\n' > scripts/docker/new-helper.sh
git add -A
git update-index --chmod=-x scripts/docker/new-helper.sh
git commit -q -m "upstream: add new-helper.sh (accidentally non-executable)"
git ls-files -s scripts/docker/new-helper.sh | grep -q '^100644' || fail "mode self-heal: test setup didn't actually commit the fixture as non-executable"
cd "$BASE/mode-consumer"

yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/mode-upstream" >/dev/null 2>&1 || true

git ls-files -s -- 'scripts/**/*.sh' | awk '$1 != "100755" { print; found=1 } END { exit found }' \
  || fail "mode self-heal: a scripts/**/*.sh file is still tracked non-executable after the sync ran"
pass "mode self-heal: sync-upstream.sh restored the executable bit on the newly-synced script"

echo ""
echo "=== Relocated-file guard: upstream moving a file the consumer customized should give actionable guidance, not a raw git-apply dump ==="
cd "$BASE"
mkdir move-upstream && cd move-upstream
git init -q -b main
git config user.email up@test.com; git config user.name Upstream
mkdir -p mystic_auth app old-location
echo "core v1" > mystic_auth/core.py
echo "compose v1" > old-location/compose.yml
git add -A && git commit -q -m "move-upstream base"
cd "$BASE"
mkdir move-consumer && cd move-consumer
git init -q -b main
git config user.email me@test.com; git config user.name Consumer
cp -r "$BASE/move-upstream/mystic_auth" .
cp -r "$BASE/move-upstream/app" .
cp -r "$BASE/move-upstream/old-location" .
git add -A && git commit -q -m "Initial commit from template"
install_script "$BASE/move-consumer"
git add -A && git commit -q -m "Add sync script"
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/move-upstream" >/dev/null 2>&1 || true

# Consumer customizes the file at its old path...
echo "compose v1 -- my own tweak" > old-location/compose.yml
git add -A && git commit -q -m "my own customization of compose.yml"

# ...while upstream, independently, relocates that same file to a new
# directory (delete old-location/compose.yml, add new-location/compose.yml).
# Neither side has matching content to 3-way-merge the delete hunk against,
# so `git apply --3way` hard-fails outright instead of leaving conflict
# markers -- the case this guard is for.
cd "$BASE/move-upstream"
git rm -q old-location/compose.yml
mkdir -p new-location
echo "compose v2 -- restructured" > new-location/compose.yml
git add -A && git commit -q -m "upstream: move compose.yml to new-location/"
cd "$BASE/move-consumer"

set +e
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/move-upstream" >/tmp/move-sync.log 2>&1
MOVE_SYNC_EXIT=$?
set -e

grep -q "moved or deleted" /tmp/move-sync.log || fail "relocated-file guard: didn't detect the hard-failed apply on the moved file"
pass "relocated-file guard: detected the hard-failed apply on the moved file"
grep -q "old-location/compose.yml" /tmp/move-sync.log || fail "relocated-file guard: didn't name the specific path that failed"
pass "relocated-file guard: names the specific path that failed"
grep -q -- "--3way --index -" /tmp/move-sync.log || fail "relocated-file guard: didn't suggest the re-diff-and-exclude recipe"
pass "relocated-file guard: suggests the re-diff-and-exclude recipe"
[ "$MOVE_SYNC_EXIT" -ne 0 ] || fail "relocated-file guard: sync should have exited non-zero"
pass "relocated-file guard: sync exits non-zero"
[ -z "$(git diff --cached --name-only)" ] || fail "relocated-file guard: something got staged despite the hard failure"
pass "relocated-file guard: nothing staged/committed despite the hard failure"

echo "=== Upstream-owned script renames: apply even when the old path is already absent ==="
cd "$BASE"
mkdir script-rename-upstream && cd script-rename-upstream
git init -q -b main
git config user.email up@test.com; git config user.name Upstream
mkdir -p scripts/mystic_auth/db scripts/mystic_auth/testing
printf '#!/usr/bin/env bash\necho backup\n' > scripts/mystic_auth/db/backup_failure_alert.sh
printf '#!/usr/bin/env bash\necho restore\n' > scripts/mystic_auth/db/db_restore.sh
printf '#!/usr/bin/env bash\necho seed\n' > scripts/mystic_auth/testing/seed-codex-accessibility-user.sh
chmod +x scripts/mystic_auth/db/*.sh scripts/mystic_auth/testing/*.sh
git add -A && git commit -q -m "script-rename-upstream base"
cd "$BASE"
mkdir script-rename-consumer && cd script-rename-consumer
git init -q -b main
git config user.email me@test.com; git config user.name Consumer
cp -r "$BASE/script-rename-upstream/scripts" .
git add -A && git commit -q -m "Initial commit from template"
install_script "$BASE/script-rename-consumer"
git add -A && git commit -q -m "Add sync script"
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/script-rename-upstream" >/dev/null 2>&1 || true

# The consumer removed the old source path independently before the upstream
# rename arrived. This is the exact case that made git apply require a path
# that no longer existed in the index.
git rm -q scripts/mystic_auth/db/backup_failure_alert.sh
git commit -q -m "Consumer removes obsolete backup helper"
cd "$BASE/script-rename-upstream"
git mv scripts/mystic_auth/db/backup_failure_alert.sh scripts/mystic_auth/db/database-backup-failure-alert.sh
mkdir -p scripts/mystic_auth/db/database-backup scripts/mystic_auth/db/database-restore tests/scripts/mystic_auth/accessibility
git mv scripts/mystic_auth/db/database-backup-failure-alert.sh scripts/mystic_auth/db/database-backup/database-backup-failure-alert.sh
git mv scripts/mystic_auth/db/db_restore.sh scripts/mystic_auth/db/database-restore/database-restore.sh
git mv scripts/mystic_auth/testing/seed-codex-accessibility-user.sh tests/scripts/mystic_auth/accessibility/seed-accessibility-user.sh
git add -A && git commit -q -m "upstream: reorganize maintenance scripts"
cd "$BASE/script-rename-consumer"

printf 'y\n' | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/script-rename-upstream" >/tmp/script-rename-sync.log 2>&1 \
  || fail "script rename: sync failed when an old source path was absent"
[ -f scripts/mystic_auth/db/database-backup/database-backup-failure-alert.sh ] || fail "script rename: backup target missing"
[ -f scripts/mystic_auth/db/database-restore/database-restore.sh ] || fail "script rename: restore target missing"
[ -f tests/scripts/mystic_auth/accessibility/seed-accessibility-user.sh ] || fail "script rename: seed target missing"
[ ! -e scripts/mystic_auth/db/backup_failure_alert.sh ] || fail "script rename: old backup path retained"
[ ! -e scripts/mystic_auth/db/db_restore.sh ] || fail "script rename: old restore path retained"
[ -f .mystic-auth-sync-state ] || fail "script rename: sync state was not updated"
git log -1 --format=%s | grep -q "Sync upstream template updates" \
  || fail "script rename: sync did not create its commit"
pass "script rename: upstream-owned renames applied and committed"

echo "=== Missing sync stage: a lone entry script must fail clearly before fetching anything ==="
cd "$BASE"
git init -q -b main partial-consumer
cd partial-consumer
git config user.email "test@example.com"
git config user.name "Test"
mkdir -p scripts/mystic_auth/upstream-sync
cp "$REAL_SCRIPT" scripts/mystic_auth/upstream-sync/sync-upstream.sh
chmod +x scripts/mystic_auth/upstream-sync/sync-upstream.sh
git add -A && git commit -q -m "Entry point only"
PARTIAL_EXIT=0
PARTIAL_OUTPUT="$(./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/does-not-exist" 2>&1)" || PARTIAL_EXIT=$?
[ "$PARTIAL_EXIT" -ne 0 ] || fail "missing stage: sync succeeded without its stage files"
for stage in review apply finalize; do
  printf '%s\n' "$PARTIAL_OUTPUT" | grep -q "sync-upstream-${stage}.sh" || fail "missing stage: ${stage} stage not named in the error"
done
git remote get-url upstream >/dev/null 2>&1 && fail "missing stage: upstream remote was added before the preflight failed"
pass "missing stage: entry point fails before touching the repo and names every missing stage"
