echo "=== Ownership guard: upstream touching a fork-owned path must block the sync ==="
cd "$BASE"
mkdir own-upstream && cd own-upstream
git init -q -b main
git config user.email up@test.com; git config user.name Upstream
mkdir -p mystic_auth backend/app frontend/src/app tests/backend/app ci/mystic_auth docs/app
echo "core v1" > mystic_auth/core.py
echo "main v1" > backend/app/main.py
echo "sdk v1" > backend/app/sdk.py
echo "App v1" > frontend/src/app/App.tsx
echo "sdk v1" > frontend/src/app/sdk.ts
printf '// template bootstrap comment v1\n// stable context 1\n// stable context 2\n// stable context 3\n// stable context 4\n// stable context 5\nconst appValue = 1;\n' > frontend/src/app/main.tsx
printf '// template theme comment v1\n// stable context 1\n// stable context 2\n// stable context 3\n// stable context 4\n// stable context 5\nconst themeValue = 1;\n' > frontend/src/app/theme.ts
echo "downstream test v1" > tests/backend/app/test_downstream.py
echo "template CI v1" > ci/mystic_auth/backend.sh
echo "readme v1" > docs/app/README.md
echo "root readme v1" > README.md
git add -A && git commit -q -m "own-upstream base"
cd "$BASE"
mkdir own-consumer && cd own-consumer
git init -q -b main
git config user.email me@test.com; git config user.name Consumer
cp -r "$BASE/own-upstream/mystic_auth" .
cp -r "$BASE/own-upstream/backend" .
cp -r "$BASE/own-upstream/frontend" .
cp -r "$BASE/own-upstream/tests" .
cp -r "$BASE/own-upstream/ci" .
cp -r "$BASE/own-upstream/docs" .
cp "$BASE/own-upstream/README.md" .
git add -A && git commit -q -m "Initial commit from template"
install_script "$BASE/own-consumer"
git add -A && git commit -q -m "Add sync script"
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/own-upstream" >/dev/null 2>&1 || true

# Projects created before the CI split receive the three app entrypoints once.
cd "$BASE/own-upstream"
mkdir -p ci/app
echo "app backend CI v1" > ci/app/backend.sh
echo "app frontend CI v1" > ci/app/frontend.sh
echo "app browser CI v1" > ci/app/frontend-e2e.sh
git add -A && git commit -q -m "upstream: introduce split app CI entrypoints"
cd "$BASE/own-consumer"
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/own-upstream" >/dev/null 2>&1 || true
[ -f ci/app/backend.sh ] || fail "ownership bootstrap: app backend CI entrypoint was not adopted"
[ -f ci/app/frontend.sh ] || fail "ownership bootstrap: app frontend CI entrypoint was not adopted"
[ -f ci/app/frontend-e2e.sh ] || fail "ownership bootstrap: app browser CI entrypoint was not adopted"
pass "ownership bootstrap: pre-split consumer adopted the three app CI entrypoints"
echo "downstream app CI" > ci/app/custom_checks.sh

# Upstream, after that first sync, commits to a fork-owned path it should
# never touch again (backend/app/custom_route.py, not one of the extend-in-
# place exceptions) alongside an innocuous template-owned change.
cd "$BASE/own-upstream"
echo "owned by the fork, upstream must not add this" > backend/app/custom_route.py
echo "upstream must not add this" > tests/backend/app/test_upstream_accident.py
echo "upstream must not add this" > ci/app/upstream_accident.sh
echo "template reference test update" >> tests/backend/app/test_downstream.py
echo "core v2" > mystic_auth/core.py
echo "root readme v2 -- upstream must not touch this" > README.md
git add -A && git commit -q -m "upstream: accidentally ships into backend/app/"
cd "$BASE/own-consumer"

set +e
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/own-upstream" >/tmp/own-sync.log 2>&1
OWN_SYNC_EXIT=${PIPESTATUS[1]}
set -e

grep -q "downstream-owned paths" /tmp/own-sync.log || fail "ownership guard: didn't report the violation"
pass "ownership guard: reports the violation"
grep -q "backend/app/custom_route.py" /tmp/own-sync.log || fail "ownership guard: didn't name the offending path"
pass "ownership guard: names the offending path"
grep -q "tests/backend/app/test_upstream_accident.py" /tmp/own-sync.log || fail "ownership guard: didn't name the downstream test path"
pass "ownership guard: names downstream test paths"
grep -q "ci/app/upstream_accident.sh" /tmp/own-sync.log || fail "ownership guard: didn't name the downstream CI path"
pass "ownership guard: names downstream CI paths"
[ "$OWN_SYNC_EXIT" -ne 0 ] || fail "ownership guard: sync should have exited non-zero"
pass "ownership guard: sync exits non-zero"
[ -z "$(git diff --cached --name-only)" ] || fail "ownership guard: something got staged despite the violation"
pass "ownership guard: nothing staged despite the violation"
[ "$(cat mystic_auth/core.py)" = "core v1" ] || fail "ownership guard: template-owned file changed despite the blocked sync"
pass "ownership guard: template-owned change also withheld until the violation is resolved"

echo "=== Ownership guard: newline-containing app paths are parsed losslessly ==="
cd "$BASE/own-upstream"
NEWLINE_APP_PATH=$'backend/app/owned\nnotes.txt'
printf 'must stay app-owned\n' > "$NEWLINE_APP_PATH"
git add -- "$NEWLINE_APP_PATH" && git commit -q -m "upstream: add newline app path"
cd "$BASE/own-consumer"

set +e
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/own-upstream" >/tmp/own-sync-newline.log 2>&1
OWN_SYNC_NEWLINE_EXIT=${PIPESTATUS[1]}
set -e
[ "$OWN_SYNC_NEWLINE_EXIT" -ne 0 ] || fail "newline ownership guard: sync should have rejected the app-owned path"
grep -Fq 'backend/app/owned\nnotes.txt' /tmp/own-sync-newline.log \
  || fail "newline ownership guard: did not report the complete escaped path"
[ -z "$(git diff --cached --name-only)" ] || fail "newline ownership guard: something got staged despite the violation"
[ ! -e "$NEWLINE_APP_PATH" ] || fail "newline ownership guard: app-owned file was applied"
pass "newline ownership guard: path is rejected and reported without applying it"

cd "$BASE/own-upstream"
git rm -q -- "$NEWLINE_APP_PATH"
git commit -q -m "upstream: remove newline app path"
cd "$BASE/own-consumer"

echo "=== Ownership guard: extend-in-place exceptions must NOT be blocked ==="
cd "$BASE/own-upstream"
git rm -q backend/app/custom_route.py
git rm -q tests/backend/app/test_upstream_accident.py
git rm -q ci/app/upstream_accident.sh
git commit -q -m "upstream: revert the accidental backend/app/ ship"
echo "main v2 -- extended in place" > backend/app/main.py
echo "App v2 -- extended in place" > frontend/src/app/App.tsx
git add -A && git commit -q -m "upstream: legitimate edits to the shared extend-in-place files"
cd "$BASE/own-consumer"

set +e
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/own-upstream" >/tmp/own-sync-2.log 2>&1
# PIPESTATUS[1], not $?: `yes` gets SIGPIPE (141) the instant the script
# below it exits and stops reading, and with pipefail set that can win over
# the script's own (successful) exit status depending on timing -- the
# script's actual code is always the second element.
OWN_SYNC_EXIT_2=${PIPESTATUS[1]}
set -e

grep -q "downstream-owned paths" /tmp/own-sync-2.log && fail "ownership guard: flagged an extend-in-place exception as a violation"
pass "ownership guard: backend/app/main.py and frontend/src/app/App.tsx stay unblocked"
[ "$OWN_SYNC_EXIT_2" -eq 0 ] || fail "ownership guard: sync of the legitimate exception-only change should have succeeded"
pass "ownership guard: sync succeeds once the violation is gone"
[ "$(cat backend/app/main.py)" = "main v2 -- extended in place" ] || fail "ownership guard: main.py extend-in-place edit didn't land"
pass "ownership guard: extend-in-place edit lands normally"
[ "$(cat README.md)" = "root readme v1" ] || fail "ownership guard: upstream README change overwrote the downstream copy"
pass "ownership guard: upstream README change was ignored and downstream copy preserved"
grep -q "template reference test update" tests/backend/app/test_downstream.py \
  || fail "ownership guard: inherited reference test update did not land"
pass "ownership guard: inherited reference test update lands normally"

echo "=== Ownership guard: allow comment-only app-shell maintenance, keep code protected ==="
cd "$BASE/own-consumer"
sed -i 's/const appValue = 1;/const downstreamAppValue = 2;/' frontend/src/app/main.tsx
sed -i 's/const themeValue = 1;/const downstreamThemeValue = 2;/' frontend/src/app/theme.ts
git add -A && git commit -q -m "consumer: customize app shell"
cd "$BASE/own-upstream"
sed -i 's/template bootstrap comment v1/template bootstrap comment v2/' frontend/src/app/main.tsx
sed -i 's/template theme comment v1/template theme comment v2/' frontend/src/app/theme.ts
git add -A && git commit -q -m "upstream: refresh app-shell comments"
cd "$BASE/own-consumer"

set +e
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/own-upstream" >/tmp/own-sync-comments.log 2>&1
OWN_SYNC_COMMENTS_EXIT=${PIPESTATUS[1]}
set -e
[ "$OWN_SYNC_COMMENTS_EXIT" -eq 0 ] || fail "comment-only maintenance: sync was blocked"
grep -q 'template bootstrap comment v2' frontend/src/app/main.tsx || fail "comment-only maintenance: main.tsx comment did not update"
grep -q 'downstreamAppValue = 2' frontend/src/app/main.tsx || fail "comment-only maintenance: downstream main.tsx code was lost"
grep -q 'template theme comment v2' frontend/src/app/theme.ts || fail "comment-only maintenance: theme.ts comment did not update"
grep -q 'downstreamThemeValue = 2' frontend/src/app/theme.ts || fail "comment-only maintenance: downstream theme.ts code was lost"
pass "comment-only maintenance: comments update and downstream code remains"

cd "$BASE/own-upstream"
sed -i 's/const appValue = 1;/const upstreamAppValue = 3;/' frontend/src/app/main.tsx
echo "core v3" > mystic_auth/core.py
git add -A && git commit -q -m "upstream: attempt app-shell code change"
cd "$BASE/own-consumer"

set +e
yes | ./scripts/mystic_auth/upstream-sync/sync-upstream.sh "$BASE/own-upstream" >/tmp/own-sync-code.log 2>&1
OWN_SYNC_CODE_EXIT=${PIPESTATUS[1]}
set -e
grep -q 'downstream-owned paths' /tmp/own-sync-code.log || fail "app-shell code guard: did not report ownership violation"
[ "$OWN_SYNC_CODE_EXIT" -ne 0 ] || fail "app-shell code guard: executable-code change was not blocked"
grep -q 'frontend/src/app/main.tsx' /tmp/own-sync-code.log || fail "app-shell code guard: did not name the path"
[ "$(cat mystic_auth/core.py)" = "core v2" ] || fail "app-shell code guard: unrelated template change landed despite the violation"
pass "app-shell code guard: executable-code changes remain blocked"

echo ""
echo "=== ALL CHECKS PASSED ==="
