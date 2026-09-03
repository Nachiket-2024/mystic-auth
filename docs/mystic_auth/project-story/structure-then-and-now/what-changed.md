# Structure: Then and Now

---

Companion to the [Project Story](../README.md) and [How It Evolved](../timeline/README.md). Those pages
explain why the architecture changed. This page shows what the actual folder structure looked
like right before the Claude Code era started, next to what it looks like today, so the shape of
the change is visible at a glance instead of only described in prose, followed by a summary of
the differences.

Both trees list only files and folders that are actually committed to the repository (no
`__pycache__`, `node_modules`, build output, coverage reports, or anything else covered by
`.gitignore`). The "then" tree is the real commit tree at
[`946e384`](../../../..), the last commit of the manual, ChatGPT-assisted era, on 14 April, 2026. The
"now" tree reflects the repository as it stands today.

---

## Pages

- [Then](folder-tree-then.md): the tree at the last pre-Claude-Code commit.
- [Now](folder-tree-now.md): the tree as it stands today.

---

## What Changed, In Short

- **One package became two, on both sides.** `backend/app/` and `frontend/src/app/` are now thin,
  project-owned shells (entry point plus `sdk.py`/`sdk.ts` and `app_sdk.py`/`app_sdk.ts`). All the
  actual feature code moved into `backend/mystic_auth/` and `frontend/src/mystic_auth/`, the
  upstream-owned package a template update can safely overwrite. See
  [Using This Repository as a Template](../../template-usage/overview.md) for the ownership model
  and [Syncing with Upstream](../../template-usage/syncing-upstream/README.md) for how updates flow through
  `scripts/upstream-sync/sync-upstream.sh`.
- **Role-based access became policy-based.** `authorization/` is a new top-level module: policies,
  conditions, an evaluator, caching, and its own audit log. `role` is now descriptive metadata, not
  the thing access decisions are made from. See [PBAC Architecture](../../authorization/architecture/README.md).
- **New backend modules**: `audit_log/` (security/session audit trail), `emails/` (template
  rendering, sending, address normalization), `error_monitoring/` (Sentry-protocol error
  reporting), `procrastinate_tasks/` (replaced `taskiq_tasks/`, itself a replacement for the
  original Celery setup), `user_lifecycle/` (self-service deletion and admin purge),
  `user_session/` (the Manage Sessions dashboard and real-time session events). `user_crud/` and
  `user_table/` were renamed and merged into `user/`.
- **New frontend modules**: `account_settings/`, `audit_log/`, `authorization/`, `layout/`,
  `permissions/`, `policies/`, `rate_limits/`, `theme/`, `translations/`, `ui/`, `users/` replaced
  the old flat `auth/` plus `dashboard/` plus `store/` layout. Redux was replaced by Zustand
  (client state) and TanStack Query (server state).
- **Docs, tests, and CI did not exist before and now do.** `docs/` (split into project-owned
  `docs/app/` and upstream `docs/mystic_auth/`), `tests/` (mirroring the same split, plus
  `unit/integration/security/performance` suites), and `.github/workflows/ci.yml` are all new. See
  [Testing Overview](../../testing/overview.md).
- **Deployment grew from one Compose file to separate mode files.** Dev, each local-prod tunnel
  variant, and prod now live under `docker/compose/`, with Dockerfiles under
  `docker/dockerfiles/`, plus `docker/Caddyfile` and `docker/nginx.frontend.conf`.
  `scripts/` and `local-scripts/` (startup, backup/restore,
  system-user bootstrap, upstream sync) are also new; none of this existed when everything ran
  from a single `docker-compose.yml` with two Dockerfiles.
- **`demo_assets/` became `screenshots/`.**

---

See [How It Evolved](../timeline/README.md) for the commit-by-commit path between these two trees.

---
