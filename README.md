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
![Tests](https://img.shields.io/badge/tests-passing-brightgreen?logo=githubactions)
![Bugsink](https://img.shields.io/badge/Error%20Monitoring-Bugsink-purple)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Overview

MysticAuth is a starting point you copy into your own project when you need to handle "who is this user, and what are they allowed to do" for a web app. It gives you sign-up, sign-in, and permission checks that already work, so you don't build them from scratch. In plain terms, it covers two jobs:

- **Authentication**: proving who someone is (email and password, or signing in with Google).
- **Authorization**: deciding what a signed-in user is allowed to do.

For authorization, this template uses something called Policy-Based Access Control, or **PBAC**. If you've used other systems, you've probably seen Role-Based Access Control (RBAC) instead, where access is tied to a `role` field on the user, like `if role == "admin"`. That works, but every new permission means changing code and shipping a deploy. PBAC stores permissions as `Policy` rows in the database instead. An admin can assign or take away a policy while the app is running, with no code change and no redeploy. A user's `role` field still exists here, but only as a label shown in the UI. It is never checked when deciding what someone can do.

---

Use this template if you want authentication and fine-grained permissions that you own and can change, instead of paying for and configuring an external identity provider (a third-party service that handles login for you, often shortened to **IdP**). If your app only needs plain role-based access with no extra conditions, you don't need to learn PBAC's full feature set to get it: one policy per role, with no conditions attached, behaves exactly like RBAC. See [RBAC Quickstart](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authorization/rbac-quickstart).

---

### Why this exists

This started as the same authentication and authorization foundation getting rebuilt from scratch for take-home assignments that needed auth, OAuth2, and roles. It grew from a small reusable module into a full auth + authorization template with refresh-token rotation, rate limiting, background email delivery, and a real test suite. See [Project Story](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/project-story) for the full history.

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

- **Backend:** FastAPI (async), SQLAlchemy 2.0 (`asyncpg`), Alembic (a tool that tracks and applies database schema changes over time, so the database can be upgraded safely instead of by hand)
- **Auth:** Email and password login with Argon2 password hashing (a one-way scrambling algorithm, so even if the database leaked, the actual passwords aren't recoverable from it), sessions kept in JWTs (JSON Web Tokens: signed, tamper-evident tokens that prove who you are) stored in httpOnly cookies (cookies that JavaScript in the browser can't read, which blocks a common way of stealing a session), plus Google OAuth2 with PKCE (the standard flow for "Sign in with Google," hardened against a token being intercepted mid-flow)
- **Authorization:** Policy-Based Access Control, explained above. See [PBAC Architecture](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authorization/architecture)
- **Frontend:** TypeScript, React 19 + Vite, Chakra UI v3, Zustand + TanStack Query
- **i18n:** short for internationalization, meaning the app can display its text in more than one language. Supports English, Hindi, Marathi, and Gujarati via `react-i18next`. See [Translations](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/translations/overview)
- **Data/Infra:** PostgreSQL (the database), Redis (a fast in-memory store used here for caching, rate limits, and token state), Procrastinate (a background job queue that runs on Postgres itself, so there's no extra broker service like RabbitMQ to run)
- **Error Monitoring:** Self-hosted Bugsink, on by default, so backend and frontend errors are captured somewhere you can see them instead of only showing up in logs no one is watching
- **Backups:** A scheduled `pg_dump` (Postgres's built-in database-dump tool) runs as a sidecar container by default in local-prod and prod. This is a reasonable baseline, not a full production backup system: see [Known Issues](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/concerns) for what it doesn't cover yet
- **Deployment:** Docker (packages the app and its dependencies into containers that run the same way everywhere), with a dev mode, a self-hosted local-prod mode reachable through a Cloudflare Tunnel, and a prod mode behind Caddy (a web server that manages HTTPS certificates automatically) on your own server

See [Auth Flow](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authentication/overview) and [Security Hardening](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/security/hardening) for the full feature list.

---

## Key Features

- **Refresh-token rotation with reuse detection**: a login session is really two tokens: a short-lived access token and a longer-lived refresh token that fetches new access tokens. Each time the refresh token is used, it's swapped for a new one. If an old, already-swapped refresh token ever shows up again (a sign it may have been stolen and copied), the whole session chain is revoked, not just that one request.
- **Real-time cross-device session revocation**: logging out or revoking a session pushes an update over SSE (Server-Sent Events, a way for the server to push updates to the browser without the browser having to keep asking) plus Redis Pub/Sub, so other open tabs and devices sign out within seconds instead of waiting for their next request.
- **Dual rate limiting**: per-IP and per-account request limits are enforced independently, so one misbehaving IP address can't lock every account behind it out, and vice versa.
- **Offline session geolocation**: a session's approximate location (city/country) is looked up from a local IP database on disk, not by calling a third-party geolocation API for every request.
- **Dual audit logs**: one system-wide audit trail for admins, and a separate per-user-facing log, so admins and end users each see the events relevant to them without digging through the other's.
- **Per-account appearance**: each account can set its own brand color, applied across the whole UI.

---

## Quickstart (Docker)

This section assumes Docker is installed. Docker runs the whole app (backend, frontend, database, and more) as a set of isolated containers, so you don't need to install Postgres, Redis, or Python packages on your own machine by hand.

1. On GitHub, click **[Use this template](https://github.com/Nachiket-2024/mystic-auth/generate)**. This creates a brand new repository under your own account that starts as a copy of this one, with no shared commit history and no "fork" relationship back to this repo. It's the standard way to start a new project from a template on GitHub.
2. Clone *your* new repository and set up its local config:

   ```bash
   git clone https://github.com/<your-username>/<your-repo>.git
   cd <your-repo>
   cp .env.example .env
   ```

   `.env` holds settings and secrets the app reads on startup (database credentials, API keys, and so on). `.env.example` ships with placeholder values that are good enough to run locally out of the box; you only need to replace them with real values before deploying somewhere real (see [Security Decisions](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/security/decisions)).

3. Start everything with the dev helper script for your shell:

   ```bash
   ./scripts/docker/dev-up.sh        # Git Bash / WSL / Linux / macOS
   # .\scripts\docker\dev-up.ps1     # PowerShell
   # scripts\docker\dev-up.cmd       # Command Prompt
   ```

4. Once it's up, open:

   - **Frontend:** http://localhost:5173
   - **Backend / API docs:** http://localhost:8000/docs
   - **Bugsink (error monitoring):** http://localhost:8010

5. Create the one reserved "system superuser" account. This is a special account meant for the person operating the deployment, separate from any regular user. Interactively:

   ```bash
   docker compose exec -it backend python -m mystic_auth.scripts.create_system_user
   ```

   Or non-interactively (handy if you reset your local stack often), using `local-scripts/dev/create-system-user.{sh,ps1,bat}`: copy `system-user.env.example` next to the script, fill in the values, and run it. That filled-in copy is gitignored (excluded from version control), so real credentials never get committed.

For running without Docker, the local-prod and prod modes, and a full list of environment variables, see [Docker Overview](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/docker/overview), [Deployment Guide](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/deployment/guide), and [System Superuser: Bootstrapping and Promotion](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/authentication/system-superuser).

---

## Using this as a template

See [Using This Repository as a Template](https://nachiket-2024.github.io/mystic-auth-docs/docs/mystic_auth/template-usage/overview) for pulling in future upstream updates, and the `app/` vs `mystic_auth/` code split so your own code never conflicts with a `sync-upstream.sh` run.

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
