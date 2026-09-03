# Structure: Now

---

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
    local-prod-cloudflare/
    local-prod-ngrok/
    local-prod-tailscale/
    prod/
  docker/
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
      frontend.Dockerfile
    postgres-init/
  screenshots/
  .github/
    workflows/
      ci.yml
  env/
    .env.example
    .env.local-prod-cloudflare.example
    .env.local-prod-ngrok.example
    .env.local-prod-tailscale.example
    .env.prod.example
  README.md
  SECURITY.md
  pytest.ini
```

---

See [Then](folder-tree-then.md) for the pre-Claude-Code tree, or [What Changed](what-changed.md) for a summary.

---
