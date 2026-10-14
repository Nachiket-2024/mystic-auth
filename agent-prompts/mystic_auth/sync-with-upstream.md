Update this downstream project with the approved changes from the MysticAuth
template at https://github.com/Nachiket-2024/mystic-auth. Work from the
downstream repository root. Read
[the sync guide](../../docs/mystic_auth/template-usage/syncing-upstream/README.md)
and its ownership table before changing files; the guide defines the supported
workflow and exceptional paths.

---

## Before syncing

- Review `git status`, the staged diff, and the branch that should receive the
  update. Do not commit or discard the owner's work to make the index clean.
- Confirm `scripts/mystic_auth/upstream-sync/sync-upstream.sh` exists in the
  working tree before preserving or stashing anything. Follow the guide if it
  is missing from `HEAD` or already staged.
- The sync script requires an empty Git index. Preserve any staged owner work
  using the guide's pre-sync procedure before running it; do not commit or
  discard that work. The script can preserve unstaged and untracked work itself.
- Read only `COMPOSE_PROJECT_NAME`, `APP_NAME`, and `BRAND_COLOR` from the
  existing dev env file if the workflow needs them. Never display or copy
  secret values through the agent context.
- Review the incoming change summary and structural moves before confirming
  the script prompt. This prompt is the owner's request to sync; when it was
  supplied for that purpose, do not ask for a second approval. Preserve
  unstaged work as described in the guide.

---

## Apply and review

Run `scripts/mystic_auth/upstream-sync/sync-upstream.sh` (or its `.ps1` or
`.cmd` wrapper for the current shell) and follow its preflight, ownership
guard, and conflict instructions. Do not bypass the guard, force a partial
apply, or resolve conflicts by choosing a side without checking the ownership
rules. If the sync stops on conflicts or multiple Alembic heads, leave the
pending state intact and report what needs review.

After a clean sync, check the changed paths and the shared entry points. Verify
that app behavior still uses the supported SDKs and extension hooks, and that
downstream-owned code, tests, docs, env files, and Compose overrides remain
intact. Review any template changes to shared files such as
`backend/app/main.py`, `frontend/src/app/App.tsx`, CI, dependency manifests, or
ignore rules with the project's own extensions in mind.
Review database major-version changes before starting Compose. The sync script
applies files but does not migrate data volumes; follow the relevant upgrade
guide, including the PostgreSQL 15 to 18 dump-and-restore procedure if that
version change is incoming.

Use the repository's documented env-copy workflow if runtime files need new
fields. Do not read, print, overwrite, or delete real env files or `.bak`
backups without the owner's explicit approval. Keep app-only values in
`env/app/`; do not move product code or settings into `mystic_auth/` internals.

---

## Validate and report

Run the applicable CI checks from `.github/workflows/ci.yml`, including the
backend, frontend, tooling, migration, Docker, and browser checks the local
environment supports. Follow the guide for checks that need Postgres, Valkey,
Docker, browsers, or credentials. Fix failures caused by this sync; report
environment blockers with the exact check and reason.

Before finishing, inspect the result and check whitespace: if the script made
a sync commit, use `git show --check --stat --oneline HEAD`; otherwise use
`git diff --check`. Do not push or create a second commit: the sync script owns
its successful sync commit. If the owner wants to review that result without
keeping the generated commit, follow the guide's soft-reset review procedure.

Summarize the upstream changes, app-side compatibility review, checks passed,
checks blocked or failed, and the final working-tree state. Never claim the
sync is complete while conflicts, multiple migration heads, or failed required
checks remain unresolved.

---
