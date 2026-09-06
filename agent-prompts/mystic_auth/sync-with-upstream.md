Sync this app with the latest mystic-auth template
(https://github.com/Nachiket-2024/mystic-auth) and do the full integration:

1. Read only the COMPOSE_PROJECT_NAME line from env/.env (or whichever
   env file exists) to get this project's own name/image prefix - use
   that value anywhere below that needs it, don't ask me for it. Don't
   read, print, or otherwise touch any other field in that file.
2. Check how far behind upstream we are and whether upstream did any
   structural reorg (moved/renamed top-level dirs, config files, or
   scripts) since our last sync - check the top-level tree diff directly,
   don't just trust the sync script to handle it silently.
3. Run scripts/mystic_auth/upstream-sync/sync-upstream.sh. If it hard-fails on any
   shared config file (docker-compose*, .env*.example, Dockerfiles)
   because upstream relocated it, re-diff excluding those paths, apply
   that, then hand-port our app-specific additions into upstream's new
   file/location yourself.
4. Resolve every merge conflict by hand: comment-only diffs take
   upstream's wording; a real conflict in main.py/App.tsx (the only files
   in the "shared, extend in place" tier that upstream can keep changing)
   gets both sides merged. Never hand-edit anything under
   backend/mystic_auth/, frontend/src/mystic_auth/, docs/mystic_auth/,
   screenshots/mystic_auth/, backend/app/sdk.py, or
   frontend/src/app/sdk.ts - a conflict in any of those means something
   went wrong upstream of this step, not something to merge by hand.
5. Grep our own app-side code/tests for any import path pointing into a
   now-renamed mystic_auth internal module, and fix those.
6. Regenerate every real env file without reading any of its old secret
   values yourself:
   a. Rename each one aside with a .bak suffix (env/.env to
      env/.env.bak, etc.) - never delete.
   b. Run scripts/mystic_auth/env-tools/setup-env/setup-env.sh to generate fresh files with
      newly generated secrets and this sync's latest fields.
   c. For each pair, run
      scripts/mystic_auth/env-tools/copy-env-values/copy-env-values.sh env/.env.bak env/.env
      (matching the other renamed files) to copy every field that isn't
      a freshly generated secret back from the old file into the new one.
      Its own output only prints field names, never values - don't read
      the .bak files with cat or anything else yourself.
   d. Show me its "In old file but not in new file" output, if any: that
      means upstream dropped or renamed a field our app depends on, and
      needs a decision from me.
   e. Once I've confirmed the new files are correct, delete the .bak
      files.
7. Check for anything else upstream restructured that our app depends on:
   compose service names, Docker project/image names (must stay
   "<project-name>-*" from step 1, not a generic template name - avoids
   container/network/port collisions on a shared host), doc/README
   references to old paths.
8. Run scripts/mystic_auth/upstream-sync/check-alembic-heads.sh; if it reports
   multiple heads, write the merge migration yourself.
9. Rebuild and run the full test suite in Docker (backend
   unit/integration/security with the 85% coverage gate, frontend
   typecheck/lint/vitest/build). Fix anything broken in app-owned code; if
   a failure traces back to an upstream mystic-auth file/test, don't fix
   it - tell me exactly what's broken and why.
10. Update any of our own doc/README references to the sync (e.g. a
    "currently synced to" line, if we keep one) and any other stale
    doc/README/CI references. Don't touch .mystic-auth-sync-state -
    sync-upstream.sh already updated it as part of step 3.
11. No git commits, don't push - leave everything staged/uncommitted so I
    can review before committing.
12. Do this yourself directly - no subagents/Task agents for any part of
    this. Work through it inline in this session.
