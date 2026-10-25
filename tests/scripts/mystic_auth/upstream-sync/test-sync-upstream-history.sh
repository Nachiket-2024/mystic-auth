echo "=== Executable bit: every tracked shell script must be tracked as 755 in THIS repo's git index ==="
# Checked against the git index, not the working tree: core.filemode=false
# (common on Windows) never flags a local `chmod +x` as a diff, so a script
# can run fine locally while staying non-executable for every other clone.
# The scenarios below all `chmod +x` their fake-repo copies explicitly, so
# none of them would catch this -- only checking this repo's own tracked
# mode does.
NON_EXEC_SH="$(cd "$REPO_ROOT" && git ls-files -s -- '*.sh' | awk '$1 != "100755" { print }')"
if [ -n "$NON_EXEC_SH" ]; then
  fail "executable bit: found tracked shell scripts without mode 755:
$NON_EXEC_SH"
fi
pass "executable bit: every tracked shell script is mode 755"

echo "=== Setting up fake upstream ==="
mkdir upstream && cd upstream
git init -q -b main
git config user.email up@test.com; git config user.name Upstream
mkdir -p mystic_auth app
echo "core v1" > mystic_auth/core.py
cat > app/main.py <<'EOF'
app.include_router(health_router)
app.include_router(auth_router)
EOF
echo "# readme" > README.md
git add -A && git commit -q -m "upstream commit 1"
cd "$BASE"

echo "=== Simulating 'Use this template' (fresh history, no shared ancestry) ==="
mkdir consumer && cd consumer
git init -q -b main
git config user.email me@test.com; git config user.name Consumer
cp -r ../upstream/mystic_auth .
cp -r ../upstream/app .
cp ../upstream/README.md .
mkdir -p backend/app
echo "downstream-only app code" > backend/app/local_only.py
git add -A && git commit -q -m "Initial commit from template"
install_script "$BASE/consumer"
git add -A && git commit -q -m "Add sync script (part of template)"

echo "=== Sync refuses to mix staged downstream work into its commit ==="
echo "downstream staged work" > staged-downstream.txt
git add staged-downstream.txt
set +e
./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/upstream" >/tmp/dirty-index-sync.log 2>&1
DIRTY_INDEX_EXIT=$?
set -e
[ "$DIRTY_INDEX_EXIT" -ne 0 ] || fail "dirty index: sync should refuse staged work"
grep -q "Git index contains staged changes" /tmp/dirty-index-sync.log || fail "dirty index: refusal was not actionable"
pass "dirty index: sync refuses staged downstream work"
git restore --staged staged-downstream.txt
rm -f staged-downstream.txt /tmp/dirty-index-sync.log

echo "ignored-secret.env" > .gitignore
git add .gitignore && git commit -q -m "Ignore local secret fixture"
echo "local secret fixture" > ignored-secret.env

echo ""
echo "=== SYNC 1 (first ever, no state file -> squash path; tree already == upstream) ==="
echo "downstream-only app code that is not committed yet" > backend/app/uncommitted_only.py
rm mystic_auth/core.py
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/upstream" >/dev/null 2>&1 || true

[ -f .mystic-auth-sync-state ] || fail "sync 1: state file not created"
pass "sync 1: state file created"
[ -f backend/app/local_only.py ] || fail "sync 1: downstream-only app path was lost"
pass "sync 1: downstream-only app path was preserved"
[ -f backend/app/uncommitted_only.py ] || fail "sync 1: unstaged downstream app path was lost"
pass "sync 1: unstaged downstream app path was restored"
[ ! -e mystic_auth/core.py ] || fail "sync 1: unstaged downstream deletion was overwritten"
pass "sync 1: unstaged downstream deletion was restored"
[ -f ignored-secret.env ] || fail "sync 1: ignored downstream file was lost"
pass "sync 1: ignored downstream file was preserved"
# Put the fixture back into its normal post-sync shape before exercising the
# later incremental-sync scenarios.
git restore mystic_auth/core.py
git rm -q mystic_auth/core.py
git commit -q -m "Move an upstream file into the app split"
git log --oneline | grep -qi "upstream commit 1" && fail "sync 1: upstream commit message leaked into consumer history" || pass "sync 1: no upstream commit text in consumer log"

echo "=== Consumer makes their own edits (after their first sync, like a real user would) ==="
cat >> app/main.py <<'EOF'
app.include_router(my_projects_router)  # mine
EOF
echo "my sdk exports" > app/app_sdk.py
git add -A && git commit -q -m "Add my own feature"

echo ""
echo "=== Upstream ships release 2: unrelated file change + new file + new line in shared file ==="
cd "$BASE/upstream"
echo "core v2" > mystic_auth/core.py
echo "new_feature = True" > mystic_auth/new_feature.py
echo "remove me in the next release" > mystic_auth/obsolete.py
cat > app/main.py <<'EOF'
app.include_router(health_router)
app.include_router(billing_router)  # upstream's, inserted in the middle
app.include_router(auth_router)
EOF
git add -A && git commit -q -m "upstream commit 2: core v2, new_feature.py, billing router"
cd "$BASE/consumer"

echo ""
echo "=== Checking preview only shows NEW commits (regression test for stale-preview bug) ==="
git fetch "$BASE/upstream" main -q
PREVIEW="$(git log "$(cat .mystic-auth-sync-state)..FETCH_HEAD" --oneline)"
echo "$PREVIEW" | grep -q "upstream commit 2" || fail "preview: missing new commit"
echo "$PREVIEW" | grep -q "upstream commit 1" && fail "preview: stale commit 1 reappeared" || pass "preview: shows only new commits since last sync"

echo ""
echo "=== SYNC 2 (incremental diff/apply path) ==="
echo "downstream-only app code added before an incremental sync" > backend/app/uncommitted_incremental.py
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/upstream" >/tmp/sync2.log 2>&1 || true

[ -f mystic_auth/core.py ] || { cat /tmp/sync2.log; fail "sync 2: missing upstream baseline path was not restored"; }
[ "$(cat mystic_auth/core.py)" = "core v2" ] || fail "sync 2: untouched upstream file didn't update"
pass "sync 2: unrelated upstream-owned file updated cleanly"
[ -f mystic_auth/core.py ] || fail "sync 2: missing upstream baseline path was not restored"
pass "sync 2: missing upstream baseline path was restored before apply"
[ -f mystic_auth/new_feature.py ] || fail "sync 2: new upstream file missing"
pass "sync 2: new upstream file added"
[ -f mystic_auth/obsolete.py ] || fail "sync 2: fixture for later upstream deletion missing"
pass "sync 2: later-deleted upstream file added"
grep -q "billing_router" app/main.py || fail "sync 2: upstream's new router line missing"
grep -q "my_projects_router" app/main.py || fail "sync 2: consumer's router line lost on second sync"
grep -q "<<<<<<<" app/main.py && fail "sync 2: got a phantom conflict on a non-overlapping edit" || pass "sync 2: shared file auto-merged both sides cleanly, no phantom conflict"
[ "$(cat app/app_sdk.py)" = "my sdk exports" ] || fail "sync 2: consumer file clobbered"
pass "sync 2: consumer-only file still untouched"
[ -f backend/app/uncommitted_incremental.py ] || fail "sync 2: unstaged downstream app path was lost"
pass "sync 2: unstaged downstream app path was restored"
rm -f /tmp/sync2.log

echo ""
echo "=== Upstream ships release 3: inserts a line at the SAME spot consumer appended theirs -> real conflict ==="
cd "$BASE/upstream"
cat > app/main.py <<'EOF'
app.include_router(health_router)
app.include_router(billing_router)  # upstream's, inserted in the middle
app.include_router(auth_router)
app.include_router(admin_router)    # upstream's, appended at the same spot consumer appended theirs
EOF
rm mystic_auth/obsolete.py
git add -A && git commit -q -m "upstream commit 3: admin router appended right where consumer also appended"
cd "$BASE/consumer"

echo ""
echo "=== SYNC 3 (expect a real conflict) ==="
set +e
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/upstream" >/tmp/sync3.log 2>&1
SYNC3_EXIT=$?
set -e
[ "$SYNC3_EXIT" -ne 0 ] || fail "sync 3: expected non-zero exit on conflict"
pass "sync 3: script exits non-zero on conflict"
grep -q "DELETE mystic_auth/obsolete.py" /tmp/sync3.log || fail "sync 3: upstream deletion was not shown before confirmation"
pass "sync 3: upstream deletion shown explicitly before confirmation"
grep -q "<<<<<<<" app/main.py || fail "sync 3: no conflict markers found"
pass "sync 3: conflict markers present for genuine same-line collision"
git diff --cached --name-only | grep -q ".mystic-auth-sync-state" || fail "sync 3: state file not staged despite conflict"
pass "sync 3: sync-state file still staged even though content conflicted"

echo ""
echo "=== Resolve conflict manually, commit, verify history stays clean ==="
cat > app/main.py <<'EOF'
app.include_router(health_router)
app.include_router(billing_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(my_projects_router)  # mine, kept
EOF
git add app/main.py
git commit -q -m "Sync upstream template updates (resolved conflict)"
[ ! -e mystic_auth/obsolete.py ] || fail "final: upstream-deleted file was retained"
pass "final: upstream-deleted file removed from mystic_auth"

# Deliberately NOT --all: refs/remotes/upstream/* legitimately contains
# upstream's commits (that's just the fetched remote-tracking branch) --
# the property under test is that the CURRENT BRANCH's own history doesn't.
git log --oneline | grep -qi "upstream commit" && fail "final: upstream commit messages leaked into consumer history" || pass "final: consumer git log never contains upstream's commit history"
git merge-base --is-ancestor "$(cd "$BASE/upstream" && git rev-parse HEAD)" HEAD 2>/dev/null && fail "final: upstream HEAD became an ancestor of consumer branch" || pass "final: upstream commits never became ancestors (squash property preserved)"

echo ""
