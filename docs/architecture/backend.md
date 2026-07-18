# Backend Architecture

## Purpose

FastAPI application (`backend/app/`), async throughout — SQLAlchemy async engine, async Redis client, async SMTP. One codebase, three container roles (`backend`, `taskiq_worker`, `alembic`) built from the same image with different `command:` overrides — see [Docker Overview](../docker/overview.md).

## Module layout

| Module | Purpose |
|---|---|
| `api/` | Route registration only — one `APIRouter` per feature, no business logic. Grouped: `auth_routes/`, `user_routes/`, `pbac_routes/`, `audit_log_routes/`, `health_routes/`, plus shared `route_helpers.py` |
| `auth/` | Authentication: signup, login, logout, logout-all, refresh-token rotation, password reset, account verification, Google OAuth2/PKCE, JWT/cookie handling; `auth/security/` — `client_ip.py` (trusted-proxy-aware IP resolution), `security_headers_middleware.py`, `rate_limiter_service.py`, `login_protection_service.py` — see [Authentication Overview](../authentication/overview.md) |
| `authorization/` | PBAC engine: policies, conditions, evaluator, caching, its own audit log — see [PBAC Architecture](../authorization/architecture.md) |
| `audit_log/` | Security/session-event audit log (`security_audit_log` table) — distinct from the PBAC audit log, see [Database Design](../database/design.md#why-two-audit-tables-not-one) |
| `core/` | Cross-cutting config: `settings.py` (pydantic-settings, env-driven) |
| `database/` | `connection.py` — async SQLAlchemy engine/session factory; `base.py` — declarative base |
| `emails/` | `email_template_service.py` — shared HTML email template rendering; `email_sender.py` — SMTP transport seam (swappable provider); `email_normalization.py` — canonicalizes stored/looked-up email addresses; used by the taskiq email tasks |
| `logging/` | `logging_config.py` (structured, module-scoped loggers), `correlation_id_middleware.py`, `logging_middleware.py` (request/response logging) |
| `redis/` | `client.py` — single async Redis client, shared by rate limiting, lockout, caching, token registries, and taskiq's broker |
| `scripts/` | `create_system_user.py` — one-off interactive CLI to bootstrap the reserved system account (never exposed via any API route) |
| `taskiq_tasks/` | `email_tasks.py` — the async email-sending task and its broker — see [Background Workers](../background-workers/taskiq.md) |
| `user_crud/` | `user_crud_collector.py` + `user_crud_modules/` — CRUD orchestration for the `users` table |
| `user_table/` | `user_model.py` (SQLAlchemy model, `UserRole` enum), `user_schema.py` (Pydantic schemas) |
| `main.py` | App entrypoint: middleware registration, router mounting, global exception handler, lifespan (DB pool / Redis client cleanup on shutdown) |

## Request pipeline

```
Request
  → CorrelationIdMiddleware (outermost — sets request.state.request_id first)
  → SecurityHeadersMiddleware (attaches response headers on the way out)
  → LoggingMiddleware (logs incoming request / outgoing response)
  → CORSMiddleware (single allowed origin: FRONTEND_BASE_URL)
  → route dependency chain (get_current_user / require_authorization, rate limiting)
  → route handler
  → (any unhandled exception → global @app.exception_handler(Exception), generic 500)
```

Starlette applies middleware in reverse of add order, which is why `CorrelationIdMiddleware` is added *last* in `main.py` to end up *outermost* — see the inline comment there for the exact reasoning. See [Security Hardening](../security/hardening.md#middleware-ordering).

In production (`ENVIRONMENT=production`), `/docs`, `/redoc`, and `/openapi.json` are disabled entirely (`main.py`) — one less surface to lock down at a reverse proxy.

## Configuration

All configuration is centralized in `core/settings.py` (`pydantic-settings`, loaded from `.env`) — every setting is documented inline there with a one-line comment. No module reads an environment variable directly outside of `settings`. See `.env.example` for the full list, grouped by category.

## Database layer

SQLAlchemy 2.0, fully async (`asyncpg` driver). `database/connection.py`'s `Database` class wraps the async engine (`pool_pre_ping=True`, `pool_recycle=1800`) and session factory; a module-level `database` singleton is imported everywhere a session is needed (`Depends(database.get_session)`). Schema is managed entirely through Alembic migrations (`backend/alembic/versions/`) — no `create_all()` anywhere in application startup. See [Database Design](../database/design.md).

## Error handling

Two layers:
1. **Expected failures** — routes/services raise `HTTPException` with a specific status code and `detail`, or a service method returns `None`/`False` that the route translates into one.
2. **Unexpected failures** — `main.py`'s global exception handler catches anything that escapes both layers, logs the full traceback, and returns a generic `500` with no internal detail. Several service-layer methods (e.g. `signup_service.py`, `oauth2_service.py`) additionally wrap their own bodies in a broad `except Exception` so a partial failure (e.g. a database race) degrades to a clean, generic error response rather than an unhandled 500 — see [Security Decisions: the signup/OAuth2 email race](../security/decisions.md#the-signupoauth2-email-race).

## Logging

Structured, module-scoped loggers via `logging/logging_config.py::get_logger(__name__)` throughout. Every request gets a correlation ID (`CorrelationIdMiddleware`) that's attached to every log line emitted while handling it, making it possible to grep `docker compose logs backend` for one request's full trail. See [PBAC Troubleshooting: logging and debugging](../authorization/troubleshooting.md#logging-and-debugging) for the specific log-message prefixes used by the caching/audit subsystems.

## Testing coverage

`tests/backend/unit/`, `integration/`, `security/`, `performance/` — see [Testing Overview](../testing/overview.md).
