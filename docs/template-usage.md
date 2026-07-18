# Using This Repository as a Template

You've cloned this repo to build your own product's authentication and authorization layer on top of it. This doc is the "never seen this codebase before" starting point — what you get, how to stand it up, and where to make it yours. Every other doc in [`docs/`](README.md) describes *how the system works*; this one is about *what to do with it*.

## What this template provides

- **Authentication**: email+password signup with Argon2 hashing, email verification, login with dual rate limiting and brute-force lockout, Google OAuth2 with PKCE, JWT access+refresh tokens delivered as httpOnly cookies, refresh-token rotation with reuse detection, logout / logout-all, and a full forgot-password → reset-password flow. See [Authentication Overview](authentication/overview.md).
- **Authorization**: Policy-Based Access Control (PBAC), not RBAC. Every protected route is gated by an assigned, active `Policy` — not by a user's `role`. Policies are data (rows in Postgres), not code, so a new access pattern is a new policy, not a new deploy. See [PBAC Architecture](authorization/architecture.md) and [Security Decisions: role is never used to decide access](security/decisions.md#role-is-never-used-to-decide-access).
- **Audit logging**: two independent, append-only audit tables — a security/session-event log (login, logout, signup, lockout, account lifecycle) and a PBAC decision log (every `allow`/`deny` authorization check, with the policies that were evaluated). See [Database Design: why two audit tables](database/design.md#why-two-audit-tables-not-one).
- **Frontend**: React 19 + TypeScript SPA built with Vite, Chakra UI v3 for components/theming, Zustand for client/session state, TanStack Query for server-state caching. Feature-organized to mirror the backend's domain split. See [Frontend Architecture](architecture/frontend.md).
- **Infrastructure**: Docker Compose for local dev and production, PostgreSQL, Redis (caching/rate-limiting/token registry/Taskiq broker), Taskiq for async email delivery, Alembic for migrations, and a GitHub Actions CI workflow.

## Quickstart

```bash
git clone https://github.com/Nachiket-2024/mystic-auth.git
cd mystic-auth
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Fill in `.env` and `frontend/.env` — at minimum `SECRET_KEY` (32+ characters, the app refuses to start otherwise), `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, and `APP_NAME`/`VITE_APP_NAME` if you want your own product name from the start. Google OAuth2 and email vars can be filled in later (see below) — the app runs without them, but signup/login via those specific paths won't work until they're set.

```bash
docker compose up
```

Once the stack is up:

- **Backend**: [http://localhost:8000/docs](http://localhost:8000/docs) — FastAPI interactive docs
- **Frontend**: [http://localhost:5173](http://localhost:5173) — Vite dev server
- **PostgreSQL**: `localhost:5433` (host-side; containers reach it at `postgres:5432` internally — the non-default host port dodges the common local-Postgres collision, see [Docker Overview](docker/overview.md))
- **Redis**: `localhost:6380` (host-side; containers reach it at `redis:6379` internally, same reasoning)

Then create the reserved system superuser (one-time, CLI-only — it can never be created or promoted via any API route):

```bash
docker compose exec -it backend python -m app.scripts.create_system_user
```

See root [`README.md`](../README.md#-first-time-setup--creating-the-system-superuser) for the interactive prompts, and [Policy JSON Examples: system superuser policy](authorization/policy-examples.md#system-superuser-policy-seeded) for what that account can do out of the box.

## Environment configuration

Full variable-by-variable reference lives in [`.env.example`](../.env.example) (backend) and [`frontend/.env.example`](../frontend/.env.example) (frontend) — every setting is documented inline there with a one-line comment, grouped by category (database, JWT/tokens, OAuth2, Redis, email, login protection, rate limiting, logging, environment, reverse proxy). Copy each to its real `.env` and treat those `.example` files as the source of truth, not this doc.

One pair is worth calling out specifically, since it's the main "make this yours" hook:

| Variable | File | Purpose |
|---|---|---|
| `APP_NAME` | `.env` | Product name used in email templates and the root `/` API response. Required — no fallback. |
| `VITE_APP_NAME` | `frontend/.env` | Product name shown in the UI (navbar, auth pages) and the browser tab title (`frontend/index.html`'s `%VITE_APP_NAME%` substitution, resolved by Vite at build time). |

## Renaming the app

Change `APP_NAME` in `.env` and `VITE_APP_NAME` in `frontend/.env`, then restart (`docker compose up --build` if the frontend image was already built, since `VITE_APP_NAME` is baked in at build time, not read at runtime). Nothing else in the codebase hardcodes a product name — there's no other file to touch.

**CI still uses `APP_NAME=MysticAuth`, and that's fine.** `.github/workflows/ci.yml` sets `APP_NAME` (and every other required setting) directly as a job-level environment variable, since there's no checked-in `.env` for CI to read — `Settings` refuses to start without a value for it, so CI needs *something*. That value is a placeholder for test runs, not branding: it doesn't need to match whatever you renamed the app to locally, and you don't need to touch `ci.yml` after renaming (see [CI/CD Overview](cicd/overview.md)).

## Frontend customization

- **Design tokens / theme**: `frontend/src/theme/system.ts` — Chakra UI v3 tokens (colors, semantic tokens for brand/surface/border/text). Change the `brand` color scale here to re-skin the whole app; components reference tokens (`colorPalette="brand"`, `bg="bg.surface"`, etc.), not raw hex values.
- **Pages/features**: `frontend/src/` is organized by feature, one folder per domain — `auth/` (login, signup, logout, oauth2, password reset, account verification), `dashboard/`, `profile/`, `users_admin/`, `policies/`, `audit_log/`. Each auth sub-feature is its own folder with its Page/Form/mutation-hook/types together. See [Frontend Architecture: module layout](architecture/frontend.md#module-layout) for the full table.
- **Routing**: all routes are declared in `frontend/src/App.tsx` — add a new `<Route>` there, wrapped in `ProtectedRoute` (optionally with a `permission` prop, see [Frontend Architecture: routing](architecture/frontend.md#routing)) and `AppLayout` if it needs the sidebar/top-bar shell.
- **State**: `frontend/src/store/` — Zustand for client state (`authStore`, `themeStore`), `store/queryClient.ts` for the shared TanStack Query client. `frontend/src/api/` holds Axios-based typed call functions per backend domain.

## Backend customization

- **Adding your own domain/resource** (e.g. `projects`, `documents`): follow the existing module pattern — a new top-level package under `backend/app/` with its own `*_model.py`, `*_schema.py`, `*_crud*.py`, and a router under `backend/app/api/` mounted in `backend/app/main.py`. See [Backend Architecture: module layout](architecture/backend.md#module-layout) for how the existing modules (`auth/`, `user_table/`, `user_crud/`) are shaped.
- **Database changes**: every schema change is an Alembic migration under `backend/alembic/versions/` — no `create_all()` anywhere. See [Database Design](database/design.md#migrations).
- **Configuration**: all settings are centralized in `backend/app/core/settings.py` (`pydantic-settings`, env-driven) — add new settings there, never read `os.environ` directly elsewhere.

## PBAC usage

### Adding a new permission

Business-domain actions (e.g. `"projects:create"`, `"documents:view"`) don't need to go in the `Permission` enum at all — a policy can grant any action string freely. Only add an enum member in `backend/app/authorization/permissions.py` if the action is sensitive enough that you want the privilege-escalation guard applied (see [Adding New Permissions](authorization/adding-permissions.md) for the full guidance, including how to update seed policies via a data-only migration).

### Protecting a new route

Every protected route depends on `require_authorization(action, resource_type)` — never a role check. A real, worked example from `backend/app/api/user_routes/user_routes.py`:

```python
@router.get("/", response_model=list[UserRead])
async def list_all_users(
    current_user: dict = Depends(require_authorization(Permission.USERS_LIST_ALL.value, _RESOURCE_TYPE)),
    db: AsyncSession = Depends(database.get_session)
):
    return await user_crud.get_all(db)
```

`require_authorization(action, resource_type)` is a dependency factory (`backend/app/authorization/dependencies/authorization_dependency.py`) that builds the request's authorization context and calls `AuthorizationService.require(...)` for you — raising `403` if no assigned, active policy grants that action on that resource type (optionally condition-gated by time, network, ownership, etc.). For your own resources, `resource_type` doesn't need to be a `Permission` enum value at all — pass any string you want (`"projects"`, `"documents"`) and grant the matching action string via a policy (see [Writing and Testing Policies](authorization/writing-testing-policies.md#policy-creation-workflow)).

If the route needs to check a *different* action depending on runtime data (like `user_routes.py`'s role-assignment route does — assigning `system` role needs a stricter action than assigning any other role), call `authorization_service.require(...)` directly inside the handler instead of relying solely on the route-level dependency; see that route's own code for the pattern.

## Replacing the frontend entirely

The backend has no frontend-specific coupling — it's a stateless JSON API you can drive from any client. What it expects:

- **Cookie-based JWT auth**: `access_token` (path `/`) and `refresh_token` (path `/auth`, scoped), both httpOnly/secure/`SameSite=Strict`. There is no bearer-token/header auth mode — a replacement client must send/receive cookies (`withCredentials`/`credentials: "include"` equivalent) and be served from an origin matching `FRONTEND_BASE_URL` (CORS only allows that one origin).
- **The full route contract** (paths, methods, auth requirements, request/response shapes): [API Reference](api/reference.md).

Nothing in the backend imports from or references `frontend/` — deleting the entire `frontend/` directory and building a new client (a different SPA, a mobile app, a server-rendered app) against the same API is a supported use of this template.

## OAuth setup (Google)

Mechanics (PKCE, CSRF `state`, account-hijack handling) are covered in [OAuth2 / PKCE](authentication/oauth2-pkce.md). To get it working for your own Google Cloud project:

1. Create an OAuth 2.0 Client ID in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Web application type).
2. Add an authorized redirect URI that exactly matches `GOOGLE_REDIRECT_URI` below (scheme, host, path, and trailing slash all matter — a mismatch is the most common setup failure, see [OAuth2 / PKCE: troubleshooting](authentication/oauth2-pkce.md#troubleshooting)).
3. Fill in `.env`:

   | Variable | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | From the Cloud Console credential |
   | `GOOGLE_CLIENT_SECRET` | From the Cloud Console credential |
   | `GOOGLE_REDIRECT_URI` | Must match the Console-registered URI exactly, e.g. `http://localhost:8000/auth/oauth2/callback/google` for local dev |

## Email setup

Mechanics (Taskiq broker, HTML templates, failure handling) are covered in [Background Workers: Taskiq](background-workers/taskiq.md). To send real email:

| Variable | Purpose |
|---|---|
| `FROM_EMAIL` | The Gmail account sending mail (also the SMTP auth username) |
| `GMAIL_APP_PASSWORD` | A Gmail [App Password](https://myaccount.google.com/apppasswords) (not your normal account password — requires 2FA enabled on the Google account) |
| `SUPPORT_EMAIL` | Optional; used as the `Reply-To` header, falls back to `FROM_EMAIL` if unset |

Without valid values here, signup/verification/password-reset emails will fail to send — `send_email_task` logs the full traceback and retries up to 3 times (see [Background Workers: Taskiq](background-workers/taskiq.md)) — but the rest of the app keeps working.

## Deployment

Covered in full in the [Deployment Guide](deployment/guide.md) — dev vs. production Compose topology, required production environment variables, database migrations, backup runbook, and free/low-cost hosting options for each of the four pieces (backend, frontend, Postgres, Redis). Production Compose file: [`docker-compose.prod.yml`](../docker-compose.prod.yml).

## Where to go next

- New to the codebase generally? Start at [`docs/README.md`](README.md) for the full documentation index.
- Building your first protected feature? [Adding New Permissions](authorization/adding-permissions.md) → protect the route (above) → [Writing and Testing Policies](authorization/writing-testing-policies.md) to create and assign the policy that grants it.
- Something not behaving as documented? [PBAC Troubleshooting](authorization/troubleshooting.md) covers the most common authorization/Docker/Redis issues.

## Getting help

Stuck on something this doc set doesn't answer? Search [existing GitHub Issues](https://github.com/Nachiket-2024/mystic-auth/issues) first, then open a new one with clear reproduction steps if you can't find it. Fixes and improvements are welcome as Pull Requests — see the root [README](../README.md#-getting-help--contributing).
