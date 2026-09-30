# Structure: Now

---

This is the current repository tree as of 1 October, 2026. It reflects the established
`app/` and `mystic_auth/` ownership split, the PBAC implementation, the shadcn/Radix frontend,
the separated test suites, the five Docker deployment modes, and the exact template extension
points. Generated files, local secrets, build output, and test caches are omitted.

```text
mystic-auth/
  backend/
    alembic/
    app/                        # thin, project-owned shell
      main.py
      sdk.py
      app_sdk.py
      core/
        settings.py               # app-owned BaseSettings extension point
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
      valkey/
      scripts/
      user/
      user_lifecycle/
      user_session/
    requirements.txt
    requirements-dev.txt
    pyproject.toml
    alembic.ini
  frontend/
    e2e/                          # thin re-export wrappers (@playwright/test, @axe-core/playwright):
                                   # tests/frontend/ specs live outside frontend/'s own module
                                   # resolution scope, so a direct import fails there
    src/
      app/                       # thin, project-owned shell
        landing_page/
        legal/
        status_pages/
        translations/
        App.tsx
        main.tsx
        sdk.ts
        app_sdk.ts
      mystic_auth/                # upstream-owned package
        account_settings/
        active_sessions/          # renamed from dashboard/manage_sessions/, its own
                                   # top-level folder since Dashboard is no longer
                                   # its only consumer (Account Settings, Audit Log,
                                   # Rate Limits all render it too)
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
                                  # environment, error-monitoring, geolocation, glossary,
                                  # legal, project-story, security, template-usage,
                                  # testing, translations
      project-story/
        timeline/
          2026-oct.md
  tests/
    backend/
      app/
        test_settings.py
      mystic_auth/
        unit/
          auth/security/
            test_rate_limiter_dashboard_edge_cases_unit.py
        integration/
        security/
        performance/
    frontend/
      app/
        e2e/
      mystic_auth/
        unit/
          audit_log/security_log/
            securityAccessChangeDetails.test.ts
          store/
            fontSizeStore.test.ts
          ui/
            routing/
              RouteSkeleton.test.tsx
            shadcn/
              button.test.tsx
            shared_components.test.tsx
        integration/
        e2e/
    scripts/                     # script/tooling tests, including host-run port derivation
      mystic_auth/
        db/
          test-backup-compose-network.sh
          test-backup-freshness.sh
          test-backup-roundtrip.sh
        docker/
          test-backend-host-run.sh
        env-tools/
          test-setup-env.ps1
  agent-prompts/
    app/                         # project-owned prompts
    mystic_auth/                 # upstream prompts
      new-project-setup.md
      sync-with-upstream.md
  scripts/
    app/                         # project-owned scripts
      env-tools/
        rotate-secrets/fields.env.example
        set-env-field/shared-values.env.example
    mystic_auth/                 # upstream scripts
      db/
      docker/
        dev/
          backend-host-run.sh
          backend-host-run.ps1
          backend-host-run.cmd
      env-tools/
      load-test/
      testing/                   # disposable test-account seeding (e.g. accessibility scans)
      upstream-sync/
  local-scripts/
    app/                         # project-owned local scripts
      seed-user-permission-matrix.py
    mystic_auth/                 # upstream local scripts
      dev/
      local-prod-cloudflare/
      local-prod-ngrok/
      local-prod-tailscale/
      prod/
  docker/
    tailscale-serve-config.json  # single JSON, no include mechanism, stays Shared tier
    app/                         # project-owned Compose overrides, Dockerfiles, proxy config; ships empty
      compose/
        docker-compose.dev.yml
        docker-compose.local-prod-cloudflare.yml
        docker-compose.local-prod-ngrok.yml
        docker-compose.local-prod-tailscale.yml
        docker-compose.prod.yml
      dockerfiles/                 # your own extra services, e.g. your-service.Dockerfile
      caddy/                       # your own .caddy site blocks, picked up by an `import` glob
      nginx/                       # your own nginx include files, same glob pattern
      postgres-init/                # your own bootstrap scripts, mounted per-file in your compose override
    mystic_auth/                 # upstream Compose files, Dockerfiles, Caddyfile, nginx config, postgres-init
      Caddyfile
      nginx.frontend.conf
      compose/
        docker-compose.dev.yml
        docker-compose.local-prod-cloudflare.yml
        docker-compose.local-prod-ngrok.yml
        docker-compose.local-prod-tailscale.yml
        docker-compose.prod.yml
      dockerfiles/
        backend.Dockerfile
        backend-entrypoint.sh
        frontend.Dockerfile
        db-backup.Dockerfile
        db-backup-entrypoint.sh
      postgres-init/
        init-bugsink-db.sh
  screenshots/
    app/                         # project-owned screenshots
    mystic_auth/                 # upstream screenshots
  .github/
    workflows/
      ci.yml
    PULL_REQUEST_TEMPLATE.md
  .project/
    project_story.md
  makefiles/
    app/                         # project-owned make/make.ps1 targets, ships empty
      Makefile
      make.ps1
    mystic_auth/                 # upstream make/make.ps1 targets
      Makefile
      make.ps1
  env/
    app/                         # project-owned env fields; default-policy hook included
      .env.dev.example
      .env.local-prod-cloudflare.example
      .env.local-prod-ngrok.example
      .env.local-prod-tailscale.example
      .env.prod.example
    mystic_auth/                 # upstream env fields
      .env.dev.example
      .env.local-prod-cloudflare.example
      .env.local-prod-ngrok.example
      .env.local-prod-tailscale.example
      .env.prod.example
  README.md
  SECURITY.md
  CONTRIBUTING.md
  Makefile
  make.ps1
  pytest.ini
```

---

See [Then](folder-tree-then.md) for the pre-Claude-Code tree, or [What Changed](what-changed.md) for a summary.

---
