# MysticAuth
---

**📖 Documentation Site: [https://nachiket-2024.github.io/mystic-auth-docs/](https://nachiket-2024.github.io/mystic-auth-docs/)**

![Python](https://img.shields.io/badge/python-3.14-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.141+-green?logo=fastapi)
![React](https://img.shields.io/badge/React-19+-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6+-blue?logo=typescript)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-async-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7+-red?logo=redis)
![Procrastinate](https://img.shields.io/badge/Procrastinate-async-orange)
[![CI](https://github.com/Nachiket-2024/mystic-auth/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Nachiket-2024/mystic-auth/actions/workflows/ci.yml)
![Bugsink](https://img.shields.io/badge/Error%20Monitoring-Bugsink-purple)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Overview

MysticAuth is a full-stack authentication and authorization template for web applications that need owned user accounts, session management, auditability, and database-backed access control.

It provides two core subsystems:

1. **Authentication**: email/password signup, account verification, Google OAuth2 with PKCE, JWT access tokens, refresh-token rotation, session tracking, password reset, logout, logout-all, and account deletion.
2. **Authorization**: Policy-Based Access Control (PBAC) with database-backed policies, direct grants, condition evaluation, privilege-escalation guards, policy history, authorization audit logs, and frontend permission checks.

The `users.role` column is presentation metadata. Runtime authorization decisions are made from policies and direct permission grants, not from role string comparisons. Projects that only need role-shaped access can still model RBAC by assigning one unconditioned policy per role. See [RBAC Quickstart](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authorization/rbac-quickstart).

---

Use this template when the application should own its account database and authorization model instead of delegating both concerns to an external identity provider. The implementation favors explicit server-side checks, httpOnly cookies, revocable refresh-token chains, durable audit records, and testable authorization policies.

---

### Why this exists

This started as a reusable authentication foundation for projects that needed account login, OAuth2, and access control. It grew into a template with refresh-token rotation, rate limiting, PBAC, background email delivery, audit logging, self-hosted error monitoring, production-shaped Docker deployments, and a broad automated test suite. See [Project Story](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/project-story) for the history.

---

## Screenshots

The screenshots below follow the path a user or administrator would normally take through the app: sign in, review their own dashboard, try the command palette, then move into account settings, appearance, user and policy management (including bulk actions and direct permission grants), the permission catalog, and audit review.

---

### 1. Landing Page
![Landing Page](screenshots/mystic_auth/landing_page.png)

---

### 2. Sign In
![Login Page](screenshots/mystic_auth/login.png)

---

### 3. Standard User Dashboard
![Dashboard](screenshots/mystic_auth/dashboard.png)

---

### 4. Command Palette
![Command Palette](screenshots/mystic_auth/command_palette.png)

---

### 5. System Superuser Dashboard
![System User Dashboard](screenshots/mystic_auth/system_user_dashboard.png)

---

### 6. System Superuser Dashboard (Hindi)
![System User Dashboard Hindi](screenshots/mystic_auth/system_user_dashboard_hindi.png)

---

### 7. Account Settings
![Account Settings](screenshots/mystic_auth/account_settings.png)

---

### 8. Account Settings - Permissions
![Account Settings Permissions](screenshots/mystic_auth/account_settings_permissions.png)

---

### 9. Appearance
![Appearance](screenshots/mystic_auth/appearance.png)

---

### 10. User Management
![User Management](screenshots/mystic_auth/users.png)

---

### 11. Bulk Actions on Users
![Users Bulk Actions](screenshots/mystic_auth/users_bulk_actions.png)

---

### 12. Assign Policies
![Policy Assignment](screenshots/mystic_auth/assign_policies.png)

---

### 13. Grant Permission
![Grant Permission](screenshots/mystic_auth/grant_permission.png)

---

### 14. Permissions Catalog
![Permissions Catalog](screenshots/mystic_auth/permissions_catalog.png)

---

### 15. Policy Management
![Policy Management](screenshots/mystic_auth/policies.png)

---

### 16. Edit Policy
![Edit Policy](screenshots/mystic_auth/edit_policy.png)

---

### 17. Rate Limits
![Rate Limits](screenshots/mystic_auth/rate_limits.png)

---

### 18. Security Events
![Security Events](screenshots/mystic_auth/security_events.png)

---

### 19. Audit Logs
![Audit Logs](screenshots/mystic_auth/audit_log_system_user.png)

---

## Stack

- **Backend:** FastAPI, SQLAlchemy 2.0 async ORM with `asyncpg`, Alembic migrations, Pydantic settings and schemas.
- **Authentication:** Argon2 password hashing, JWT access tokens, rotating refresh tokens, httpOnly cookies, Google OAuth2 with PKCE, server-side session revocation, password reset, account verification, and account lifecycle controls.
- **Authorization:** Policy-Based Access Control with policy rows, direct user grants, typed condition handlers, policy history, privilege-escalation guards, and allow/deny audit records. See [PBAC Architecture](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authorization/architecture).
- **Frontend:** TypeScript, React 19 + Vite, Chakra UI v3, Zustand + TanStack Query
- **i18n:** English, Hindi, Marathi, and Gujarati via `react-i18next`. See [Translations](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/translations/overview).
- **Data/Infra:** PostgreSQL for durable state, Redis for derived state and token/rate-limit counters, Procrastinate for PostgreSQL-backed background jobs.
- **Error Monitoring:** Self-hosted Bugsink using the Sentry SDK protocol for backend and frontend exception reporting.
- **Backups:** Scheduled `pg_dump` sidecar in local-prod and prod. See [Known Issues](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/concerns) for remaining backup gaps.
- **Deployment:** Docker dev mode, local-prod tunnel mode through Cloudflare/ngrok/Tailscale, and server-hosted prod mode behind Caddy-managed TLS.
- **Browser E2E:** Playwright tests cover the app and MysticAuth UI split under `tests/frontend/app/e2e/` and `tests/frontend/mystic_auth/e2e/`, including auth, dashboard, account settings, admin pages, responsive layouts, and no-email stubbed flows. See [Browser E2E Tests](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/testing/browser-e2e)

See [Auth Flow](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authentication/overview) and [Security Hardening](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/security/hardening) for the full feature list.

---

## Key Features

- **Refresh-token rotation with reuse detection**: each refresh consumes one refresh-token JTI and issues a replacement. Reuse of an already-consumed refresh token revokes the affected session chain.
- **Real-time cross-device session revocation**: logout, logout-all, targeted session revocation, and permission changes publish Redis Pub/Sub events that reach open browsers through Server-Sent Events.
- **Dual rate limiting**: per-IP and per-account counters are enforced independently, with separate brute-force lockout for login.
- **Offline session geolocation**: session location is resolved from a local MaxMind database when configured, avoiding per-request calls to a third-party geolocation API.
- **Dual audit logs**: security events and authorization decisions are stored separately so user-facing history and administrative authorization analysis remain distinct.
- **Per-account appearance**: each account can set its own brand color, applied across the whole UI.

---

## Quickstart (Docker)

This section assumes Docker is installed. The dev Compose stack starts the backend, frontend, PostgreSQL, Redis, Procrastinate worker, Alembic migration runner, and Bugsink.

1. On GitHub, click **[Use this template](https://github.com/Nachiket-2024/mystic-auth/generate)**. This creates a brand new repository under your own account that starts as a copy of this one, with no shared commit history and no "fork" relationship back to this repo. It's the standard way to start a new project from a template on GitHub.
2. Clone *your* new repository and run the quickstart script:

   ```bash
   git clone https://github.com/<your-username>/<your-repo>.git
   cd <your-repo>
   ./scripts/mystic_auth/env-tools/quickstart/quickstart.sh                  # Git Bash / WSL / Linux / macOS
   # .\scripts\mystic_auth\env-tools\quickstart\quickstart.ps1     # PowerShell
   # scripts\mystic_auth\env-tools\quickstart\quickstart.cmd       # Command Prompt
   ```
---

   This is the whole setup in one command: it generates every `env/.env*` file (plus `frontend/.env`) from its `.example` if `env/.env` doesn't exist yet (distinct random secret per password field, one app name/brand color prompt applied everywhere), brings the dev stack up and waits for it to be healthy, offers to create the system superuser right there, then tails logs. Safe to re-run any time. Prefer to see and run each step yourself? See [Using This Repository as a Template: Quickstart](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/template-usage/overview#quickstart) for the same steps run individually (`setup-env`, `dev-up`, `create_system_user`), and for what each remaining field (Google OAuth, SMTP, a real domain, tunnel tokens) means.

3. Once it's up, open:

   - **Frontend:** http://localhost:5173
   - **Backend / API docs:** http://localhost:8000/docs
   - **Bugsink (error monitoring):** http://localhost:8010

For running without Docker, the local-prod and prod modes, keeping secrets rotated (`scripts/mystic_auth/env-tools/check-env/`, `scripts/mystic_auth/env-tools/rotate-secrets/`), and a full list of environment variables, see [Docker Overview](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/docker/overview), [Deployment Guide](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/deployment/guide), and [System Superuser: Bootstrapping and Promotion](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authentication/system-superuser).

---

## Using this as a template

See [Using This Repository as a Template](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/template-usage/overview) for pulling in future upstream updates, and the `app/` vs `mystic_auth/` code split so your own code never conflicts with a `sync-upstream.sh` run.

Prefer to hand setup or syncing to an AI coding agent instead of following the docs by hand? [`agent-prompts/`](agent-prompts/mystic_auth/README.md) has ready-to-paste starting prompts for both.

---

## Documentation

Documentation site: **[nachiket-2024.github.io/mystic-auth-docs](https://nachiket-2024.github.io/mystic-auth-docs/)**

---

## Getting Help & Contributing

Issues and pull requests are welcome. Check [Known Issues & Concerns](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/concerns) and [PBAC Troubleshooting](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authorization/troubleshooting) first, then search [existing issues](https://github.com/Nachiket-2024/mystic-auth/issues) before opening a new one. **Found a security vulnerability?** Don't open a public issue. See [SECURITY.md](SECURITY.md) for private reporting.

---

## License

MIT. See [LICENSE](LICENSE).

---
