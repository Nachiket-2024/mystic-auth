# Structure: Now

---

This selected repository tree reflects the structure as of 25 October, 2026. It highlights the
`app/` and `mystic_auth/` ownership split, recent extension points, deployment modes, and notable
files; it is not an exhaustive listing of every tracked file. Generated files, local secrets,
build output, and caches are omitted too.

```text
mystic-auth/
  backend/
    alembic/
      versions/                  # token revocation, refresh, lifecycle, and PBAC migrations
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
          consumed_refresh_token_model.py
          refresh_rotation_claim.py
          refresh_rotation_store.py
          token_revocation_keys.py
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
        secret_provider.py         # downstream secret-provider boundary
      database/
      emails/
      error_monitoring/
      logging/
      procrastinate_tasks/
        account_lifecycle_tasks.py
      valkey/
      scripts/
        create_system_user.py
        create_unconditioned_policies.py
        invalidate_authorization_cache.py
        report_conditioned_grant_conflicts.py
        migrate_token_revocation_identifiers.py
      user/
      user_lifecycle/
        account_lifecycle_events.py
        account_lifecycle_outbox_model.py
        account_lifecycle_registry.py
      user_session/
    requirements.txt
    requirements-dev.txt
    pyproject.toml
    alembic.ini
  frontend/
    e2e/                          # thin Playwright re-exports for specs under tests/frontend/
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
        active_sessions/          # shared session UI used by several features
        api/
        audit_log/
        auth/
        authorization/
        core/
          cspNonce.ts
        dashboard/
        layout/
        permissions/
        policies/
        rate_limits/
        store/
        theme/
          tailwind.css
          tailwind-tokens.css
          application.css
        translations/
        ui/
        users/
  THIRD_PARTY_NOTICES/           # Python/npm app notices; base images and db_backup need separate inventory
    backend/
      README.md
      GPL-3.0.txt
    frontend/
  docs/
    app/                          # project-owned docs
    mystic_auth/                  # upstream docs: API, auth, PBAC, operations, security, testing
      cicd/
        local-validation.md
      deployment/
        database-backups.md
        database-migrations.md
        database-restore-and-recovery.md
        local-prod/
          cloudflare-named-tunnel.md
          cloudflare-quick-tunnel.md
          ngrok-tunnel.md
          tailscale-funnel.md
      project-story/
        timeline/
          2026-oct.md
      security/
        integration-secrets.md
  tests/
    backend/
      app/
        test_app_sdk_module_identity.py
        test_settings.py
        test_core_settings.py
      mystic_auth/
        unit/
          auth/current_user/
            current_user_test_support.py
          auth/security/
            test_rate_limiter_dashboard_edge_cases_unit.py
          auth/token_logic/
            test_token_revocation_keys_unit.py
          scripts/
            test_authorization_maintenance_scripts_unit.py
          core/
            test_secret_provider_unit.py
          procrastinate_tasks/
            test_procrastinate_app_unit.py
          user_lifecycle/
            test_account_lifecycle_events_unit.py
        integration/
          audit_log/
            audit_log_query_test_support.py
            test_email_job_payload_retention_integration.py
            test_security_audit_log_global_queries.py
            test_security_audit_log_user_queries.py
          auth/
            test_token_revocation_identifier_migration_integration.py
          user/
            test_account_lifecycle_outbox_retention_integration.py
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
          security/
            browser_security_headers.spec.ts
          performance/
            management_responsiveness_browser.spec.ts
    scripts/                     # script/tooling regressions
      mystic_auth/
        db/
          test-backup-encryption-check.sh
          test-backup-compose-network.sh
          test-backup-freshness.sh
          test-backup-roundtrip.sh
        accessibility/
          invoke-bash.ps1
          seed-accessibility-user.sh / .ps1 / .cmd
        lint/
          check-ci-action-pinning.sh
          check-image-digests.sh
          check-log-rotation.sh
          check-platform-wrappers.sh
          check-readonly-rootfs.sh
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
        invoke-bash.ps1
        database-backup/
          database-backup.sh / .ps1 / .cmd
          database-backup-failure-alert.sh / .ps1 / .cmd
        database-restore/
          database-restore.sh / .ps1 / .cmd
          database-restore-drill.sh / .ps1 / .cmd
        backup-verification/
          backup-hmac.sh / .ps1 / .cmd
          check-backup-encryption.sh / .ps1 / .cmd
          backup-freshness-check.sh / .ps1 / .cmd
        backup-upload/
          backup-upload.sh / .ps1 / .cmd
      docker/
        dev/
          backend-host-run.sh
          backend-host-run.ps1
          backend-host-run.cmd
      env-tools/
      load-test/
      testing/                   # disposable test-account seeding (e.g. accessibility scans)
      upstream-sync/
        sync-upstream.sh                 # orchestration entry point
        sync-upstream-review.sh
        sync-upstream-apply.sh
        sync-upstream-finalize.sh
  local-scripts/
    app/                         # project-owned local scripts
    mystic_auth/                 # upstream local scripts
      seed-user-permission-matrix.py
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
      nginx.error-headers.conf
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
        ngrok.Dockerfile
        cloudflared.Dockerfile
      cloudflared-entrypoint.go / cloudflared-healthcheck.go
      ngrok-supervisor.go / ngrok-healthcheck.go
      postgres-init/
        init-bugsink-db.sh
  screenshots/
    app/                         # project-owned screenshots
    mystic_auth/                 # upstream screenshots
  .github/
    workflows/
  ci/
    app/                          # project-owned CI entry points and checks
      backend.sh / frontend.sh / frontend-e2e.sh
    mystic_auth/                  # upstream CI entry points and tooling guards
      backend.sh / frontend.sh / frontend-e2e.sh / frontend-e2e-stack.sh
      tooling.sh / tooling.ps1
      trivy-ngrok.ignore.yaml
    PULL_REQUEST_TEMPLATE.md
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
      .cloudflare-tunnel-token.example
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
