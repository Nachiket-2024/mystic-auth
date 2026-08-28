# Structure: Then and Now
---

Companion to the [Project Story](README.md) and [How It Evolved](timeline.md). Those pages
explain why the architecture changed. This page shows what the actual folder structure looked
like right before the Claude Code era started, next to what it looks like today, so the shape of
the change is visible at a glance instead of only described in prose.

Both trees below list only files and folders that are actually committed to the repository (no
`__pycache__`, `node_modules`, build output, coverage reports, or anything else covered by
`.gitignore`). The "then" tree is the real commit tree at
[`946e384`](../../..), the last commit of the manual, ChatGPT-assisted era, on 14 April, 2026. The
"now" tree reflects the repository as it stands today.

---

## Then: 14 April, 2026

One Python package, one npm package, no docs folder, no tests folder, no CI.

```text
mystic-auth/
  backend/
    alembic/
    app/
      api/
        auth_routes/
        user_routes/
      auth/
        current_user/
        login/
        logout/
        logout_all/
        oauth2/
        password_logic/
        password_reset_confirm/
        password_reset_request/
        refresh_token_logic/
        security/
        signup/
        token_logic/
        verify_account/
      core/
      database/
      logging/
      redis/
      scripts/
      taskiq_tasks/
      user_crud/
      user_table/
    requirements.txt
    alembic.ini
  frontend/
    src/
      api/
      auth/
        current_user/
        login/
        logout/
        logout_all/
        oauth2/
        password_reset_confirm/
        password_reset_request/
        signup/
        verify_account/
      core/
      dashboard/
      store/
    package.json
  docker/
    backend.Dockerfile
    frontend.Dockerfile
  demo_assets/
  docker-compose.yml
  .env.example
  README.md
```

---

A single `backend/app/` and `frontend/src/` held everything: no upstream/downstream split, no
`sdk.py`/`sdk.ts`, no `mystic_auth` package name yet. Redux was still the frontend state manager.
Access control was role-based (a `role` column on the `users` table), not policy-based. There was
no `tests/` folder, no `docs/` folder, and no CI workflow: verification was manual, screenshots
lived in `demo_assets/`, not `screenshots/`.


---
## Now

```text
mystic-auth/
  backend/
    alembic/
    app/                        # thin, project-owned shell
      main.py
      sdk.py
      app_sdk.py
    mystic_auth/                # upstream-owned package
      api/
        audit_log_routes/
        auth_routes/
        get_or_404/
        health_routes/
        pbac_routes/
        rate_limit_routes/
        user_routes/
      audit_log/
      auth/
        current_user/
        login/
        logout/
        logout_all/
        manage_sessions/
        oauth2/
        password_logic/
        password_reset_confirm/
        password_reset_request/
        refresh_token_logic/
        security/
        signup/
        token_logic/
        verify_account/
      authorization/             # PBAC engine
        caching/
        conditions/
        context/
        dependencies/
        evaluators/
        models/
        policies/
        repositories/
        schemas/
        services/
      core/
      database/
      emails/
      error_monitoring/
      logging/
      procrastinate_tasks/
      redis/
      scripts/
      user/
      user_lifecycle/
      user_session/
    requirements.txt
    requirements-dev.txt
    pyproject.toml
    alembic.ini
  frontend/
    src/
      app/                       # thin, project-owned shell
        landing_page/
        legal/
        status_pages/
        App.tsx
        main.tsx
        sdk.ts
        app_sdk.ts
      mystic_auth/                # upstream-owned package
        account_settings/
        api/
        audit_log/
        auth/
        authorization/
        core/
        dashboard/
        layout/
        permissions/
        policies/
        rate_limits/
        store/
        theme/
        translations/
        ui/
        users/
  docs/
    app/                          # project-owned docs
    mystic_auth/                  # upstream docs: api, appearance, architecture,
                                   # authentication, authorization, background-workers,
                                   # cicd, concerns, database, deployment, docker,
                                   # error-monitoring, geolocation, legal, project-story,
                                   # security, template-usage, testing, translations
  tests/
    backend/
      app/
      mystic_auth/
        unit/
        integration/
        security/
        performance/
    frontend/
      app/
      mystic_auth/
        unit/
        integration/
  scripts/
    db/
    docker/
    upstream-sync/
  local-scripts/
    dev/
    local-prod/
    prod/
  docker/
    Caddyfile
    backend.Dockerfile
    frontend.Dockerfile
    nginx.frontend.conf
    postgres-init/
  screenshots/
  .github/
    workflows/
      ci.yml
  docker-compose.yml
  docker-compose.local-prod.yml
  docker-compose.prod.yml
  .env.example
  .env.local-prod.example
  .env.prod.example
  README.md
  SECURITY.md
  pytest.ini
```

---
## What changed, in short

- **One package became two, on both sides.** `backend/app/` and `frontend/src/app/` are now thin,
  project-owned shells (entry point plus `sdk.py`/`sdk.ts` and `app_sdk.py`/`app_sdk.ts`). All the
  actual feature code moved into `backend/mystic_auth/` and `frontend/src/mystic_auth/`, the
  upstream-owned package a template update can safely overwrite. See
  [Using This Repository as a Template](../template-usage/overview.md) for the ownership model
  and [Syncing with Upstream](../template-usage/syncing-upstream.md) for how updates flow through
  `scripts/upstream-sync/sync-upstream.sh`.
- **Role-based access became policy-based.** `authorization/` is a new top-level module: policies,
  conditions, an evaluator, caching, and its own audit log. `role` is now descriptive metadata, not
  the thing access decisions are made from. See [PBAC Architecture](../authorization/architecture.md).
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
  [Testing Overview](../testing/overview.md).
- **Deployment grew from one Compose file to three.** `docker-compose.yml` (dev) is joined by
  `docker-compose.local-prod.yml` and `docker-compose.prod.yml`, plus `docker/Caddyfile` and
  `docker/nginx.frontend.conf`. `scripts/` and `local-scripts/` (startup, backup/restore,
  system-user bootstrap, upstream sync) are also new; none of this existed when everything ran
  from a single `docker-compose.yml` with two Dockerfiles.
- **`demo_assets/` became `screenshots/`.**

---

See [How It Evolved](timeline.md) for the commit-by-commit path between these two trees.

---