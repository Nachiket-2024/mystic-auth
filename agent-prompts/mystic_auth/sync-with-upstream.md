Update this downstream project with the latest changes from the MysticAuth
template at https://github.com/Nachiket-2024/mystic-auth, then run the full CI
pipeline and report any MysticAuth issues you find. Work from the downstream
repository root. This file is the whole procedure; the
[sync guide](../../docs/mystic_auth/template-usage/syncing-upstream/README.md)
has the background and the ownership table if you need them.

A short request such as "check the latest MysticAuth and follow its sync prompt"
is the maintainer's request to sync. Do not ask for a second approval to start.
Do ask before any destructive step (see rule 3).

---

## Rules that always apply

1. **Never commit and never push.** The sync leaves its result staged so the
   maintainer can review it. Do not create commits, amend, push, or reset
   history. Do not run `git reset --hard`.
2. **Never touch the project's real env files or `.bak` backups** (read,
   print, rename, overwrite, or delete) without the maintainer's explicit
   approval. You may read only `COMPOSE_PROJECT_NAME`, `APP_NAME`, and
   `BRAND_COLOR` from the dev env file if the workflow needs them. Never show
   secret values.
3. **Ask before anything destructive, and explain it first in plain words.**
   Abandoning an unfinished sync, dropping a stash, or discarding the
   maintainer's changes all count. Before asking, tell the maintainer, in
   simple and accurate language: what you are about to do, what it keeps, what
   it throws away, and what the alternative is. Then wait for a yes. Someone
   running this for the first time may not know what a stash or a staged
   change is, so say it plainly.
4. **Keep the app and the template separate.** Product code and settings belong
   in the app-owned folders (`backend/app/`, `frontend/src/app/`, `env/app/`,
   and the other `app/` folders). Do not change the template-owned
   `mystic_auth/` code to make the project work; if the template looks wrong,
   report it (see "Report" below).
5. **Do not bypass the ownership guard**, force a partial apply, or resolve a
   conflict by blindly picking one side.

---

## Step 1: Get the latest sync tools

The project's own copy of the sync scripts can be out of date (an older
ownership guard, or missing stage files), and an old copy can block a sync that
the latest one handles correctly. So always run the latest one.

```bash
git remote add upstream https://github.com/Nachiket-2024/mystic-auth.git   # only if there is no 'upstream' remote yet
git fetch upstream
git restore --source=upstream/main --worktree -- scripts/mystic_auth/upstream-sync/
```

Use the upstream default branch name if it is not `main`. This replaces the
whole tools folder (the entry point plus the review, apply, and finalize
stages, which must all come from the same version). It only changes the working
tree: do not commit it. The sync stages these files together with the rest of
the result. Never restore an older copy of these scripts from a stash.

The script also checks this itself and stops with the exact command above if the
tools are out of date.

## Step 2: Look at the current state

- Run `git status` and note the branch that will receive the update.
- If the **index has staged changes that are the maintainer's own work**, the
  sync will refuse to start. Tell the maintainer; do not commit or discard that
  work to get around it.
- If an **earlier sync is still unfinished** (the script says so, or there are
  conflicted files), do not start another one on top of it. Show the
  maintainer what is pending and ask what they want:
  - finish it, or
  - abandon it and start over. To show what abandoning would do **without
    changing anything**, run
    `scripts/mystic_auth/upstream-sync/sync-upstream.sh --abort </dev/null`.
    It prints, in plain words, what it will undo, what it leaves alone, and
    what is lost, and then cancels because nothing was typed. Pass that
    explanation on to the maintainer in your own simple words. Only after they
    say yes, run `printf 'abandon\n' | scripts/mystic_auth/upstream-sync/sync-upstream.sh --abort`.
    The script puts back any work it saved aside earlier. It never touches
    stashes it did not create.

## Step 3: Run the sync

Run `scripts/mystic_auth/upstream-sync/sync-upstream.sh` (or its `.ps1` or
`.cmd` wrapper for the current shell). It shows the incoming commits and any
file moves or deletions, then asks for confirmation. Read that summary, then
confirm: the maintainer's request is the approval.

It saves the maintainer's uncommitted work aside, applies the upstream
changes, puts that work back, and leaves the result **staged, not committed**.

## Step 4: Resolve what the sync could not do by itself

If the sync stops, leave the pending state exactly as it is and work through
these. Do not start a second sync.

- **Conflicts.** A conflict means the project edited something upstream also
  changed. Decide each one on its merits; there is no always-take or always-keep
  rule:
  - *Take upstream* when it is a fix or needed wiring: a moved import path, a
    new required import, a bug fix, a new env example line the app now reads.
  - *Keep the project's version* when it is the project's own customization:
    branding, landing page, copy, product routes, its own env values.
  - *Merge by hand* when both apply, and note what you did.

  The seeded starter files (`app_sdk.*`, `models.py`, `main.tsx`, `theme.ts`,
  each `app/` folder's `README.md`, `env/app/.env*.example`, the starter
  `legal/` and `status_pages/` components) merge three-way, so a customized copy
  shows up as a conflict for you to judge. Upstream-owned files that the project
  also edited (for example `ci.yml`, `.dockerignore`, `vite.config.ts`, an old
  migration) can conflict too; apply the same judgment and mention it.
- **Your saved work.** If the maintainer had uncommitted work, the sync set it
  aside (a stash, which is a temporary shelf) and cannot put it back while
  conflicts are unresolved. The output prints the exact command, like
  `git stash pop stash@{0}`. Once every conflict is resolved and staged, run
  that command so their work comes back, and check it landed.
- **"Already identical to upstream"** in the output is fine: the project already
  had that version.
- **Multiple Alembic heads.** If the template and the project each added a
  migration, create one merge migration in the project (for example
  `alembic merge heads -m "merge migration branches"` inside the backend
  container), review it, and stage it. Then confirm `alembic upgrade head` and
  `alembic check` pass on a fresh database.
- **Env files.** If runtime files need new fields, use the documented env-copy
  workflow (rename the real files aside, run `setup-env`, then
  `copy-env-values`). Keep app-only values in `env/app/`. Real env files need
  the maintainer's approval first (rule 2).
- **Database major-version changes.** The sync applies files but does not migrate
  data volumes. Read the upgrade guide before starting Compose, including the
  PostgreSQL dump-and-restore steps if a major version is incoming.
- **Shared entry points.** Look at what changed in `backend/app/main.py`,
  `frontend/src/app/App.tsx`, CI, dependency manifests, and ignore rules, with
  the project's own extensions in mind. Confirm the app still uses the
  supported SDKs and extension hooks and that its own code, tests, docs, env
  files, and Compose overrides are intact.

## Step 5: Run the full CI pipeline

Read `.github/workflows/ci.yml` and run every job it defines, locally, using the
same `ci/` entry points it calls. Do not stop at the quick ones. That means the
backend job (dependency audit, lint, typecheck, security, migrations,
unit, integration, security and performance tests), the frontend job, the
secrets scan, the tooling regression tests, the Docker image builds and smoke
checks, and the browser end-to-end tests for every configured browser project.
Run the Windows PowerShell tooling job only on Windows. Run the "main only" job
too, since this sync changes what `main` will run.

The browser and Docker jobs boot the dev stack from `env/*/.env.dev`. The project
name and the network subnet come from that file, so a second stack with the same
values reuses the maintainer's containers and volumes, and
`ci/mystic_auth/frontend-e2e-stack.sh down` removes the volumes and env files of
the stack it started. Run those jobs in a throwaway copy of the repository that
has only the `.example` env files, after setting a different
`COMPOSE_PROJECT_NAME` and `DOCKER_SUBNET` in the copy's
`env/mystic_auth/.env.dev`. Never point them at the project's real env files. If a
browser engine cannot run on this OS (for example WebKit on a Linux release
Playwright does not support), run that project in the matching
`mcr.microsoft.com/playwright` image and say so in the report.

Fix failures this sync caused. If something genuinely cannot run here (for
example a check that needs credentials or hardware you do not have), say which
check and exactly why. Do not describe a check as passed if you did not run it.

Whitespace check: run `git diff --cached --check`. Whitespace problems inside
incoming upstream-owned files (for example `THIRD_PARTY_NOTICES`) belong to
upstream, so do not edit them; mention them. Fix any in the project's own files.

## Step 6: Report

Never say the sync is complete while conflicts, multiple migration heads, or
failed required checks remain. Give the maintainer:

- what came in from upstream (the notable changes);
- every conflict and how you resolved it, and why;
- every check you ran, with pass or fail, and anything you could not run and why;
- the final state: what is staged, and that nothing was committed or pushed;
- **MysticAuth issues:** anything wrong in the template itself that you found
  (a failing upstream test, a broken or misleading guard, a doc that does not
  match the code, a defect). For each one give where it is, what you saw, and how
  to reproduce it. Do not fix the template's own code in the project; report it so
  it can be fixed upstream.

The maintainer reviews the staged result and commits it themselves.

---
