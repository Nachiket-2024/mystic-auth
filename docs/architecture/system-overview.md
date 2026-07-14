# System Architecture

High-level overview of the whole stack. For the PBAC authorization pipeline specifically, see [../authorization/architecture.md](../authorization/architecture.md); for deployment/runtime topology, see [../deployment/guide.md](../deployment/guide.md).

## Components

```
                         ┌─────────────────┐
                         │   Browser (SPA)  │
                         └────────┬─────────┘
                                  │ HTTPS (TLS terminated in front —
                                  │ see deployment/guide.md)
                    ┌─────────────┴──────────────┐
                    │                             │
            ┌───────▼────────┐           ┌────────▼────────┐
            │ nginx (static)  │           │  FastAPI backend │
            │ frontend build  │           │   (uvicorn)      │
            └─────────────────┘           └────────┬────────┘
                                                     │
                          ┌──────────────────────────┼──────────────────────────┐
                          │                           │                          │
                  ┌───────▼────────┐         ┌────────▼────────┐        ┌────────▼────────┐
                  │   PostgreSQL    │         │      Redis       │        │  Taskiq worker   │
                  │ (users, policies,│        │ (rate limits,     │        │ (async email     │
                  │  audit logs)    │         │  refresh-token    │        │  sending, via    │
                  │                 │         │  jti registry,    │◄───────┤  the same Redis  │
                  │                 │         │  reset/verify     │        │  as its broker)  │
                  │                 │         │  tokens)          │        │                  │
                  └─────────────────┘         └──────────────────┘        └──────────────────┘
```

- **Frontend**: React + TypeScript + Chakra UI + Zustand (client state) + TanStack Query (server state). Built as a static SPA, served by nginx in production (`docker-compose.prod.yml`) or Vite's dev server locally (`docker-compose.yml`).
- **Backend**: FastAPI, async throughout (SQLAlchemy async engine, async Redis client). One process type (`backend/app/main.py`), shared by the `backend`, `taskiq_worker`, and `alembic` containers via the same Docker image (`docker/backend.Dockerfile`) with different `command:` overrides.
- **PostgreSQL**: system of record — users, policies, policy history, both audit log tables (authorization decisions and security events).
- **Redis**: ephemeral/derived state only, never the source of truth for anything that must survive a flush — rate-limit/lockout counters, the refresh-token jti revocation registry, single-use password-reset/email-verification/OAuth2-state tokens (all with TTLs matching their expiry). Also Taskiq's broker/result backend.
- **Taskiq worker**: consumes an async task queue (Redis stream) for one job today — sending email (verification, password reset) — so a request handler returns immediately instead of blocking on SMTP.

## Why this split

- **Redis vs. Postgres**: everything in Redis is either a cache, a rate/lockout counter, or a single-use token — losing it on a restart degrades gracefully (a user re-requests a password reset; a rate limit resets) rather than corrupting state. Nothing that needs to survive indefinitely (users, policies, audit history) lives there.
- **Taskiq for email**: email delivery is the one slow, failure-prone I/O call in the auth flows (SMTP to an external provider). Queuing it means signup/password-reset requests aren't held open waiting on a mail server, and a transient SMTP failure doesn't fail the HTTP request that triggered it.
- **One backend image, three roles**: `backend`, `taskiq_worker`, and `alembic` all run from `docker/backend.Dockerfile` with different commands, rather than three separate images — keeps dependency versions/code identical across all three by construction, at the cost of the worker/alembic containers also containing an unused `uvicorn` entrypoint they never run.

## Request lifecycle (authenticated request)

1. Browser sends a request with `access_token`/`refresh_token` httpOnly cookies (never accessible to frontend JS — see [Authentication Flows](../authentication/overview.md)).
2. `SecurityHeadersMiddleware` and `CorrelationIdMiddleware`/`LoggingMiddleware` wrap every request (see `backend/app/main.py`, `backend/app/core/`, `backend/app/logging/`).
3. `Depends(get_current_user)` (or, for a specific action, `Depends(require_authorization(action, resource_type))`) verifies the JWT, re-queries the user row (so a since-deactivated/deleted account is rejected even with a still-valid, unexpired token — see [Security Decisions](../security/decisions.md#why-current-user-lookups-re-query-the-database-every-time)), and resolves the caller's current PBAC permissions from their assigned policies.
4. On a 401 specifically, `frontend/src/api/setupAuthInterceptor.ts` attempts one silent refresh-and-retry before giving up and marking the session invalid — see [Authentication Flows](../authentication/overview.md#refresh-token-rotation).
5. The route handler runs, using `authorization_service.authorize()`/`.require()` for any access decision beyond "is there a valid session" — every such call also writes an audit log row (allow or deny).

## Database design

See [../database/design.md](../database/design.md) for the schema itself (tables, columns, foreign keys, and why several audit tables deliberately store `user_email` as a snapshot string rather than a foreign key).
