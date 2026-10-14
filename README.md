# MysticAuth

---

**📖 Documentation Site: [https://nachiket-2024.github.io/mystic-auth-docs/](https://nachiket-2024.github.io/mystic-auth-docs/)**

![Python](https://img.shields.io/badge/python-3.14-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.143+-green?logo=fastapi)
![React](https://img.shields.io/badge/React-19+-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6+-blue?logo=typescript)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-async-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-blue?logo=postgresql)
![Valkey](https://img.shields.io/badge/Valkey-9.1.2-blue)
![Procrastinate](https://img.shields.io/badge/Procrastinate-async-orange)
[![CI](https://github.com/Nachiket-2024/mystic-auth/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Nachiket-2024/mystic-auth/actions/workflows/ci.yml)
![Bugsink](https://img.shields.io/badge/Error%20Monitoring-Bugsink-purple)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Overview

MysticAuth is a full-stack template for web application authentication and authorization.

- **Authentication:** Email/password and Google OAuth2 with PKCE, account verification, password reset, JWT access tokens, rotating refresh tokens, and session management.
- **Authorization:** Policy-Based Access Control (PBAC) using database-backed policies, direct permission grants, and condition checks.

See [Authentication](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authentication/overview) and [Authorization](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authorization/architecture) for details.

---

## Why this exists

This started as a reusable authentication foundation for projects that needed account login, OAuth2, and access control. It grew into a template with refresh-token rotation, rate limiting, PBAC, background email delivery, audit logging, self-hosted error monitoring, production-shaped Docker deployments, and a broad automated test suite. See [Project Story](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/project-story) for the history.

---

## Screenshots

The screenshots cover the public pages, authenticated user experience, account settings, session management, PBAC policy and permission management, audit logs, and denied-access behavior.

![System User Dashboard](screenshots/mystic_auth/system_user_dashboard.png)

<details>
<summary><strong>See all 22 screenshots</strong> (landing page through audit logs)</summary>

### 1. Landing Page
![Landing Page](screenshots/mystic_auth/landing_page.png)

### 2. Sign In
![Login Page](screenshots/mystic_auth/login.png)

### 3. Sign Up
![Signup Page](screenshots/mystic_auth/signup.png)

### 4. Standard User Dashboard
![Dashboard](screenshots/mystic_auth/dashboard.png)

### 5. Command Palette
![Command Palette](screenshots/mystic_auth/command_palette.png)

### 6. System Superuser Dashboard
![System User Dashboard](screenshots/mystic_auth/system_user_dashboard.png)

### 7. Language Switcher
Seven modes: English, three regional languages, and three bilingual pairings that keep the app navbar, sidebar in English while page content switches.
![Language Switcher](screenshots/mystic_auth/language_switcher.png)

### 8. Account Settings: Profile
![Account Settings](screenshots/mystic_auth/account_settings.png)

### 9. Account Settings: Permissions
Every effective permission a user holds, grouped by resource type, with which policy (or direct grant) is the source of each one.
![Account Settings Permissions](screenshots/mystic_auth/account_settings_permissions.png)

### 10. Appearance
![Appearance](screenshots/mystic_auth/appearance.png)

### 11. User Management
![User Management](screenshots/mystic_auth/users.png)

### 12. User Details Dialog
Role metadata, status, sign-in method, and recent access changes for one account.
![User Details Dialog](screenshots/mystic_auth/user_access_dialog.png)

### 13. Bulk Actions on Users
![Users Bulk Actions](screenshots/mystic_auth/users_bulk_actions.png)

### 14. Assign / Revoke Policies
Per-user policy assignment from the users table, with immediate saving and undo.
![Policy Assignment](screenshots/mystic_auth/assign_policies.png)

### 15. Grant / Revoke Permissions
The Permissions tab shows every action grouped by resource and identifies policy-based and direct grants.
![Grant Permission](screenshots/mystic_auth/grant_permission.png)

### 16. Policy Management
![Policy Management](screenshots/mystic_auth/policies.png)

### 17. Policy Details / Edit Dialog
![Edit Policy](screenshots/mystic_auth/edit_policy.png)

### 18. Permissions Catalog
Every known action, which policies grant it, how many users hold it directly, and which actions are destructive.
![Permissions Catalog](screenshots/mystic_auth/permissions_catalog.png)

### 19. Rate Limits
Live Valkey-backed counters per IP address and account, resettable by a caller with the required permission.
![Rate Limits](screenshots/mystic_auth/rate_limits.png)

### 20. Authorization Decisions
Every allow and deny decision the PBAC engine makes, across every user, with the policy that granted or would have granted it.
![Audit Logs](screenshots/mystic_auth/audit_log_system_user.png)

### 21. Security Events
Sign-in activity and session security events, with a success/failure trend chart.
![Security Events](screenshots/mystic_auth/security_events.png)

### 22. Not Authorized (403)
What a signed-in user without the required permission sees when opening a protected route directly.
![Not Authorized](screenshots/mystic_auth/not_authorized.png)

</details>

---

## Key Features

- **Refresh-token rotation with reuse detection**: each refresh consumes one refresh-token JTI and issues a replacement. Reuse of an already-consumed refresh token revokes the affected session chain.
- **Real-time cross-device session revocation**: logout, logout-all, targeted session revocation, and permission changes publish Valkey Pub/Sub events that reach open browsers through Server-Sent Events.
- **Dual rate limiting**: per-IP and per-account counters are enforced independently, with separate brute-force lockout for login.
- **Offline session geolocation**: session location is resolved from a local MaxMind database when configured, avoiding per-request calls to a third-party geolocation API.
- **Dual audit logs**: security events and authorization decisions are stored separately so user-facing history and authorization analysis remain distinct.
- **Per-account appearance**: each account can set its own brand color, applied across the whole UI.

---

## Stack

- **Backend:** Python 3.14, FastAPI, SQLAlchemy async, Pydantic, and Alembic.
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix), Zustand, TanStack Query, and `react-i18next`.
- **Authentication and authorization:** Argon2, JWT cookies, OAuth2 with PKCE, and database-backed PBAC. See [Authentication](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authentication/overview) and [PBAC Architecture](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authorization/architecture).
- **Data and jobs:** PostgreSQL 18, Valkey, and Procrastinate.
- **Error monitoring:** Self-hosted Bugsink with the Sentry SDK protocol.
- **Deployment:** Docker Compose for development, local-prod tunnels, and production behind Caddy-managed TLS.
- **Backups:** Encrypted PostgreSQL dumps can be uploaded to Backblaze B2 with rclone; freshness and restore checks are documented in [Migrations and Backups](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/deployment/migrations-and-backups).
- **Localization:** English, Hindi, Marathi, and Gujarati. See [Translations](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/translations/overview).

---

## Architecture

```mermaid
%%{init: {"themeVariables": {"lineColor": "#334155"}} }%%
flowchart TD
    Browser["Browser (SPA)"]
    Browser -- "HTTPS\n TLS terminated in front\n production/local-prod" --> Nginx
    Browser -. "direct API origin\n development only" .-> Backend
    Nginx["nginx\n (static frontend build)"]
    Backend["FastAPI backend\n (uvicorn)"]
    Nginx -->|"same-origin API proxy\n production/local-prod"| Backend
    Backend --> Postgres[("PostgreSQL\n users, policies, audit logs,\n durable token versions and replay claims")]
    Backend --> Valkey[("Valkey\n rate limits, account/chain\n version cache, reset/verify\n tokens")]
    Backend --> Bugsink["Bugsink\n self-hosted error monitoring\n own DB on same Postgres server"]
    Browser -. "unhandled errors" .-> Bugsink
    Backend --> Procrastinate["Procrastinate worker\n (async email sending,\n same Postgres as job queue)"]
    linkStyle default stroke:#334155,stroke-width:2px
```

The API uses PostgreSQL for durable data, Valkey for temporary state, and Procrastinate for background jobs. See [System Architecture](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/architecture/system-overview) for component details and request flows.

---

## Verification

CI runs backend and frontend tests, browser checks, Windows tooling, and the full Docker suite on `main`. The cumulative backend coverage gate is 90%, with a target above 95%. For local commands and platform-specific checks, see the [CI local validation guide](docs/mystic_auth/cicd/local-validation.md).

```bash
pytest --no-cov -q tests/backend/mystic_auth/security
npm run test --prefix frontend -- --run
pytest --no-cov -q tests/backend/mystic_auth/integration/authorization
```

---

## Getting Started

This quickstart uses Docker Compose. Make sure Docker Desktop is running, with WSL integration enabled if you use WSL2.

### 1. Use an AI coding agent

- **Set up a new project:** Create a repository with [Use this template](https://github.com/Nachiket-2024/mystic-auth/generate), clone it, then give your agent [`agent-prompts/mystic_auth/new-project-setup.md`](agent-prompts/mystic_auth/new-project-setup.md). It runs the quickstart and asks for your app name and brand color.
- **Sync an existing project:** Give your agent [`agent-prompts/mystic_auth/sync-with-upstream.md`](agent-prompts/mystic_auth/sync-with-upstream.md). The sync script requires a clean Git index and creates a sync commit after confirmation. See the [sync guide](docs/mystic_auth/template-usage/syncing-upstream/README.md) for the full workflow.

---

### 2. Set up manually with Docker

1. Click **[Use this template](https://github.com/Nachiket-2024/mystic-auth/generate)** on GitHub to create your project repository.
2. Clone your repository and run the script for your shell:

   ```bash
   git clone https://github.com/<your-username>/<your-repo>.git
   cd <your-repo>
   ./scripts/mystic_auth/env-tools/quickstart/quickstart.sh                  # Git Bash / WSL / Linux / macOS
   # .\scripts\mystic_auth\env-tools\quickstart\quickstart.ps1     # PowerShell
   # scripts\mystic_auth\env-tools\quickstart\quickstart.cmd       # Command Prompt
   ```

   The script creates missing environment files, asks for your app name and
   brand color, starts the stack, and offers to create a system superuser. The
   first run may take several minutes; later starts reuse images and volumes.
   For step-by-step setup, see the [manual quickstart guide](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/template-usage/overview#quickstart).

3. Once it's up, open:

   - **Frontend:** http://localhost:5173
   - **Backend / API docs:** http://localhost:8000/docs
   - **Bugsink (error monitoring):** http://localhost:8010

   These are the default ports. To run multiple stacks, set unique values for
   `POSTGRES_HOST_PORT`, `VALKEY_HOST_PORT`, `BACKEND_HOST_PORT`,
   `FRONTEND_HOST_PORT`, and `BUGSINK_HOST_PORT` in `env/mystic_auth/.env.dev`.

For non-Docker setup, deployment modes, and environment variables, see the [Docker Overview](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/docker/overview) and [Deployment Guide](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/deployment/guide). See [System Superuser](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authentication/system-superuser) for account setup.

---

## Using this as a template

See [Using This Repository as a Template](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/template-usage/overview) for the ownership split and upstream sync workflow. Keep product code in downstream-owned `app/` paths; changes to shared entry points and configuration can still need a merge during sync.

The sync script applies tracked files and does not migrate database volumes.
If an upstream update changes the PostgreSQL major version, follow the
[PostgreSQL 15 to 18 dump-and-restore guide](docs/mystic_auth/deployment/migrations-and-backups.md#postgresql-15-to-18-data-volume-upgrade)
before starting the new database image against existing data.

---

## Getting Help & Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, code style, and what CI checks before you open a PR. Check [Known Issues & Concerns](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/concerns) and [PBAC Troubleshooting](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authorization/troubleshooting) first, then search [existing issues](https://github.com/Nachiket-2024/mystic-auth/issues) before opening a new one. **Found a security vulnerability?** Don't open a public issue. See [SECURITY.md](SECURITY.md) for private reporting.

---

## License

MIT. See [LICENSE](LICENSE).

---
