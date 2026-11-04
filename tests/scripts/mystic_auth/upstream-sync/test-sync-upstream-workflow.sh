echo "=== Workflow: stage only (no auto-commit), stale tools, pending sync, --abort ==="
# Self-contained pair of repos. Uses the helpers from test-sync-upstream.sh
# (install_script, pass, fail, BASE, REAL_SCRIPT_DIR).

WF_SYNC="scripts/mystic_auth/upstream-sync/sync-upstream.sh"

cd "$BASE"
mkdir wf-upstream && cd wf-upstream
git init -q -b main
git config user.email up@test.com; git config user.name Upstream
mkdir -p mystic_auth app
printf 'core line 1\ncore line 2\ncore line 3\n' > mystic_auth/core.py
echo "app v1" > app/main.py
echo "# readme" > README.md
install_script "$BASE/wf-upstream"
git add -A && git commit -q -m "upstream 1"

cd "$BASE"
mkdir wf-consumer && cd wf-consumer
git init -q -b main
git config user.email me@test.com; git config user.name Consumer
cp -r ../wf-upstream/mystic_auth ../wf-upstream/app ../wf-upstream/README.md .
install_script "$BASE/wf-consumer"
git add -A && git commit -q -m "Initial commit from template"

# Baseline sync so the later syncs run in the normal incremental mode.
set +e
yes | MYSTIC_AUTH_SYNC_COMMIT=1 "./$WF_SYNC" "$BASE/wf-upstream" >/tmp/wf-first.log 2>&1
WF_FIRST_EXIT=${PIPESTATUS[1]}
set -e
[ "$WF_FIRST_EXIT" -eq 0 ] || { cat /tmp/wf-first.log; fail "workflow setup: first sync failed"; }
[ -f .mystic-auth-sync-state ] || fail "workflow setup: no sync state recorded"

# ---------------------------------------------------------------------------
echo "--- default: result is staged, nothing is committed, saved work comes back ---"
cd "$BASE/wf-upstream"
printf 'core line 1\ncore line 2 upstream\ncore line 3\n' > mystic_auth/core.py
printf 'extra a\nextra b\nextra c\nextra d\nextra e\n' > mystic_auth/extra.py
git add -A && git commit -q -m "upstream 2"
cd "$BASE/wf-consumer"
echo "app v1 plus my edit" > app/main.py            # unstaged downstream work
echo "scratch" > my_untracked_notes.txt             # untracked downstream work
HEAD_BEFORE="$(git rev-parse HEAD)"
set +e
yes | MYSTIC_AUTH_SYNC_COMMIT=0 "./$WF_SYNC" "$BASE/wf-upstream" >/tmp/wf-nocommit.log 2>&1
NOCOMMIT_EXIT=${PIPESTATUS[1]}
set -e
[ "$NOCOMMIT_EXIT" -eq 0 ] || { cat /tmp/wf-nocommit.log; fail "no auto-commit: sync did not succeed"; }
[ "$(git rev-parse HEAD)" = "$HEAD_BEFORE" ] || fail "no auto-commit: the script created a commit by itself"
git diff --cached --name-only | grep -qx 'mystic_auth/core.py' || fail "no auto-commit: sync result was not staged"
git diff --cached --name-only | grep -qx '.mystic-auth-sync-state' || fail "no auto-commit: sync state was not staged"
grep -q 'core line 2 upstream' mystic_auth/core.py || fail "no auto-commit: upstream change did not land"
grep -q 'plus my edit' app/main.py || fail "no auto-commit: unstaged downstream edit was not restored"
[ -f my_untracked_notes.txt ] || fail "no auto-commit: untracked downstream file was not restored"
[ -z "$(git stash list)" ] || fail "no auto-commit: a stash was left behind after a clean sync"
grep -q 'NOTHING was committed' /tmp/wf-nocommit.log || fail "no auto-commit: output did not say nothing was committed"
pass "no auto-commit: result staged, HEAD unchanged, uncommitted work restored, no leftover stash"

# Put the consumer back to a committed, clean state for the next scenarios.
git add -A && git commit -q -m "Review and commit the sync myself"

# ---------------------------------------------------------------------------
echo "--- stale sync tools: stop with the exact refresh command, then work after refreshing ---"
cd "$BASE/wf-upstream"
echo "# newer tool behavior" >> scripts/mystic_auth/upstream-sync/sync-upstream-review.sh
printf 'core line 1\ncore line 2 upstream\ncore line 3 again\n' > mystic_auth/core.py
git add -A && git commit -q -m "upstream 3 (tools and code changed)"
cd "$BASE/wf-consumer"
set +e
yes | MYSTIC_AUTH_SYNC_COMMIT=0 "./$WF_SYNC" "$BASE/wf-upstream" >/tmp/wf-stale.log 2>&1
STALE_EXIT=${PIPESTATUS[1]}
set -e
[ "$STALE_EXIT" -ne 0 ] || fail "stale tools: sync ran with out-of-date tools"
grep -q 'not the latest upstream versions' /tmp/wf-stale.log || fail "stale tools: did not explain the problem"
grep -q 'git restore --source=upstream/main --worktree -- scripts/mystic_auth/upstream-sync/' /tmp/wf-stale.log || fail "stale tools: did not give the refresh command"
[ -z "$(git status --porcelain)" ] || fail "stale tools: the stopped sync changed the working tree"
git restore --source=upstream/main --worktree -- scripts/mystic_auth/upstream-sync/
HEAD_BEFORE="$(git rev-parse HEAD)"
echo "my second edit" > my_untracked_notes.txt
set +e
yes | MYSTIC_AUTH_SYNC_COMMIT=0 "./$WF_SYNC" "$BASE/wf-upstream" >/tmp/wf-refreshed.log 2>&1
REFRESHED_EXIT=${PIPESTATUS[1]}
set -e
[ "$REFRESHED_EXIT" -eq 0 ] || { cat /tmp/wf-refreshed.log; fail "stale tools: sync failed after refreshing the tools"; }
[ "$(git rev-parse HEAD)" = "$HEAD_BEFORE" ] || fail "stale tools: refreshed run committed by itself"
git diff --cached --name-only | grep -qx 'scripts/mystic_auth/upstream-sync/sync-upstream-review.sh' || fail "stale tools: refreshed tools were not staged with the result"
grep -q 'core line 3 again' mystic_auth/core.py || fail "stale tools: upstream change did not land"
grep -q 'my second edit' my_untracked_notes.txt || fail "stale tools: untracked work was not restored"
[ -z "$(git stash list)" ] || fail "stale tools: stash left behind"
pass "stale tools: stops with the refresh command, then syncs cleanly without committing"
git add -A && git commit -q -m "Review and commit the sync myself (2)"

# ---------------------------------------------------------------------------
echo "--- unfinished sync blocks a new one; --abort explains, asks, and restores ---"
# Build a real conflict: downstream edits the same line upstream changes next.
cd "$BASE/wf-consumer"
printf 'core line 1\ncore line 2 MINE\ncore line 3 again\n' > mystic_auth/core.py
git add -A && git commit -q -m "consumer customizes an upstream-owned line"
cd "$BASE/wf-upstream"
printf 'core line 1\ncore line 2 THEIRS\ncore line 3 again\n' > mystic_auth/core.py
git mv mystic_auth/extra.py mystic_auth/extra_renamed.py
echo "brand new" > mystic_auth/brand_new.py
git add -A && git commit -q -m "upstream 4 (same line, a rename, a new file)"
cd "$BASE/wf-consumer"
git restore --source=upstream/main --worktree -- scripts/mystic_auth/upstream-sync/ 2>/dev/null || true
git fetch -q upstream 2>/dev/null || true
echo "unrelated stash content" > unrelated.txt
git add unrelated.txt && git stash push -q -m "my own unrelated stash" && git stash list | grep -q "my own unrelated stash"
echo "downstream work in progress" > wip_notes.txt
set +e
yes | MYSTIC_AUTH_SYNC_COMMIT=0 "./$WF_SYNC" "$BASE/wf-upstream" >/tmp/wf-conflict.log 2>&1
CONFLICT_EXIT=${PIPESTATUS[1]}
set -e
[ "$CONFLICT_EXIT" -ne 0 ] || fail "pending sync: expected a conflict"
[ -n "$(git ls-files -u)" ] || fail "pending sync: no unmerged files were left"
grep -q "Your uncommitted work is still set aside" /tmp/wf-conflict.log || fail "pending sync: did not say the saved work is safe and waiting"
grep -q "git stash pop stash@" /tmp/wf-conflict.log || fail "pending sync: did not give the exact command to put the saved work back"
! grep -q "could not be put back cleanly" /tmp/wf-conflict.log || fail "pending sync: called a deliberate wait an error"

set +e
yes | "./$WF_SYNC" "$BASE/wf-upstream" >/tmp/wf-blocked.log 2>&1
BLOCKED_EXIT=${PIPESTATUS[1]}
set -e
[ "$BLOCKED_EXIT" -ne 0 ] || fail "pending sync: a second sync started on top of an unfinished one"
grep -q 'unfinished' /tmp/wf-blocked.log || fail "pending sync: did not say the earlier sync is unfinished"
grep -q -- '--abort' /tmp/wf-blocked.log || fail "pending sync: did not point to --abort"
pass "pending sync: a new sync is refused with a clear explanation"

# A piped "yes" must NOT count as confirmation.
set +e
yes | "./$WF_SYNC" --abort >/tmp/wf-abort-no.log 2>&1
ABORT_NO_EXIT=${PIPESTATUS[1]}
set -e
[ "$ABORT_NO_EXIT" -ne 0 ] || fail "abort: a piped 'yes' was accepted as confirmation"
grep -q 'What this will DO' /tmp/wf-abort-no.log || fail "abort: did not explain what it will do"
grep -q 'What this will NOT touch' /tmp/wf-abort-no.log || fail "abort: did not say what it leaves alone"
grep -q 'What you LOSE' /tmp/wf-abort-no.log || fail "abort: did not say what is lost"
grep -q 'Cancelled. Nothing was changed.' /tmp/wf-abort-no.log || fail "abort: did not cancel on a wrong answer"
[ -n "$(git ls-files -u)" ] || fail "abort: cancelling changed the pending sync"
pass "abort: explains in plain words and a piped 'yes' cancels without changing anything"

printf 'abandon\n' | "./$WF_SYNC" --abort >/tmp/wf-abort-yes.log 2>&1 || { cat /tmp/wf-abort-yes.log; fail "abort: failed after the correct confirmation"; }
[ -z "$(git ls-files -u)" ] || fail "abort: unmerged files remain"
git diff --cached --quiet || fail "abort: staged changes remain"
grep -q 'core line 2 MINE' mystic_auth/core.py || fail "abort: tracked file was not put back as in the last commit"
[ -f mystic_auth/extra.py ] || fail "abort: a file the sync renamed was not put back under its old name"
[ ! -e mystic_auth/extra_renamed.py ] || fail "abort: the new name of a renamed file was left behind"
[ ! -e mystic_auth/brand_new.py ] || fail "abort: a file the sync added was left behind"
[ -z "$(git status --porcelain -- mystic_auth)" ] || fail "abort: files under mystic_auth/ still differ from the last commit"
[ -f wip_notes.txt ] || fail "abort: the saved downstream work was not brought back"
git stash list | grep -q "my own unrelated stash" || fail "abort: touched a stash that is not the sync's"
! git stash list | grep -q 'mystic-auth-sync-worktree' || fail "abort: the sync's own stash was not removed"
pass "abort: undoes the sync, brings back saved work, leaves unrelated stashes alone"

# ---------------------------------------------------------------------------
echo "--- --abort with nothing pending leaves your own staged work alone ---"
echo "my own staged work" > staged_mine.txt
git add staged_mine.txt
set +e
printf 'abandon\n' | "./$WF_SYNC" --abort >/tmp/wf-abort-none.log 2>&1
ABORT_NONE_EXIT=$?
set -e
[ "$ABORT_NONE_EXIT" -ne 0 ] || fail "abort (nothing pending): should refuse"
grep -q 'Nothing to abandon' /tmp/wf-abort-none.log || fail "abort (nothing pending): did not explain"
git diff --cached --name-only | grep -qx 'staged_mine.txt' || fail "abort (nothing pending): touched the user's own staged work"
pass "abort: refuses when no sync is pending and leaves your own staged work alone"
cd "$BASE"
