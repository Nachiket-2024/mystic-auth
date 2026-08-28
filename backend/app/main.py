import asyncio
import signal
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

BASE_DIR = Path(__file__).resolve().parent.parent.parent
_ = load_dotenv(dotenv_path=BASE_DIR / ".env")

from .sdk import (  # noqa: E402, must follow load_dotenv() above, since sdk.py reads env-dependent settings at import time
    AppError,
    CorrelationIdMiddleware,
    LoggingMiddleware,
    SecurityHeadersMiddleware,
    auth_router,
    authorization_check_router,
    bulk_permission_router,
    bulk_policy_router,
    bulk_role_router,
    capture_exception,
    database,
    get_logger,
    health_router,
    init_sentry,
    pbac_audit_log_router,
    permission_assignment_router,
    permission_catalog_router,
    policy_assignment_router,
    policy_crud_router,
    policy_history_router,
    procrastinate_app,
    rate_limit_router,
    redis_client,
    refresh_token_router,
    security_audit_router,
    settings,
    signal_session_events_shutdown,
    user_lifecycle_router,
    user_management_query_router,
    user_management_update_router,
    user_self_service_router,
    watch_for_late_dsn,
)

logger = get_logger("main")

# Before the app starts serving requests, so every request from the very
# first one onward is covered. A no-op when SENTRY_DSN is unset (see
# error_monitoring/sentry_service.py and docs/mystic_auth/error-monitoring/overview.md).
init_sentry()


def _relay_shutdown_signal_to_session_events() -> None:
    """
    Chains our own SIGTERM/SIGINT handler in front of uvicorn's, so
    signal_session_events_shutdown() fires the instant the OS delivers the
    signal - not when uvicorn gets around to calling the app's lifespan
    shutdown.

    That timing matters: uvicorn's own Server.shutdown() (see
    site-packages/uvicorn/server.py) requests shutdown on every open
    connection, then AWAITS THEM ALL CLOSING NATURALLY - with no timeout by
    default (`timeout_graceful_shutdown` is None) - before it ever calls the
    app's lifespan shutdown handler. A GET /auth/session-events connection
    never closes on its own; its whole point is staying open. So a
    shutdown_event set inside our own lifespan's teardown (after `yield`)
    would never actually run: uvicorn would already be stuck waiting for
    that same connection to close, forever, exactly the hang this exists to
    prevent.

    Installed at import time. uvicorn's own Server.serve() wraps its whole
    run in capture_signals(), which installs its handle_exit as the
    SIGTERM/SIGINT handler BEFORE it loads and imports this app module (see
    Server._serve() calling config.load() after capture_signals() has
    already entered) - so by the time this function runs, uvicorn's handler
    is already registered. signal.getsignal() below picks it up and this
    still calls it after our own work, so uvicorn's own shutdown sequence
    (should_exit -> main_loop exits -> shutdown()) proceeds completely
    unchanged; this only adds a side effect that runs first, on every
    signal delivery.

    Only meaningful on the main thread - signal.signal() raises off it
    (e.g. importing this module from a worker thread in some test runner
    configurations). Skipped rather than raised in that case: nothing else
    in this app depends on this relay actually being installed to function
    correctly outside a real server process.
    """
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            previous_handler = signal.getsignal(sig)
        except ValueError:
            return

        def _handler(signum: int, frame: object, _previous: object = previous_handler) -> None:
            signal_session_events_shutdown()
            if callable(_previous):
                _previous(signum, frame)

        try:
            signal.signal(sig, _handler)
        except ValueError:
            return


_relay_shutdown_signal_to_session_events()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    """
    Starts watch_for_late_dsn() as a fire-and-forget background task, a
    no-op unless init_sentry() above ran with SENTRY_DSN still unset (see
    that function's own docstring for why: Bugsink can take longer to
    become healthy than this app takes to boot, on a fresh/cold start).
    Never awaited, so it can't delay startup or block a single request;
    cancelled on shutdown along with everything else.

    On shutdown (SIGTERM from `docker stop` / orchestrator rolling
    restarts) explicitly dispose the DB connection pool and close the Redis
    client instead of relying on the process dying and the OS reclaiming
    the sockets. By the time this runs, every open session-events stream
    has already been told to stop by
    _relay_shutdown_signal_to_session_events() above - see that function's
    docstring for why this teardown itself is too late to be the one
    signaling it.
    """
    dsn_watcher = asyncio.create_task(watch_for_late_dsn())
    # Opens procrastinate_app's psycopg pool (separate from database.engine's
    # SQLAlchemy pool) so request handlers deferring send_email_task have a
    # live connector from the first request.
    await procrastinate_app.open_async()
    yield
    dsn_watcher.cancel()
    await database.engine.dispose()
    await redis_client.aclose()
    await procrastinate_app.close_async()


# In production, the interactive API docs are disabled: they're a debugging
# aid with no reason to be publicly reachable, and disabling them is one less
# thing to lock down at a proxy.
_is_production = settings.ENVIRONMENT.lower() == "production"
app = FastAPI(
    lifespan=lifespan,
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)

# Starlette applies middleware in reverse of add order: the LAST one added
# is OUTERMOST, running first. CorrelationIdMiddleware is added last so
# request.state.request_id is populated before every other middleware runs.

# Origins come from settings (FRONTEND_BASE_URL + optional
# FRONTEND_ADDITIONAL_BASE_URLS), not hardcoded, so this works across
# environments. Redirect/email links always point at FRONTEND_BASE_URL
# alone regardless of how many origins are CORS-allowed here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
    # Custom response headers are invisible to browser JS by default;
    # without this, X-Total-Count and Content-Disposition (the download
    # filename) are on the wire but unreadable via axios.
    expose_headers=["X-Total-Count", "Content-Disposition"],
)

app.add_middleware(LoggingMiddleware)

# Security-hardening response headers (X-Frame-Options, CSP, HSTS, etc.), see
# security_headers_middleware.py for per-header reasoning.
app.add_middleware(SecurityHeadersMiddleware)

# Added last so it becomes outermost (see note above).
app.add_middleware(CorrelationIdMiddleware)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    # Same shape as FastAPI's default handler, plus "code"/"params" so the
    # frontend can look up a translated message instead of showing this
    # English `detail` string directly.
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": exc.code, "params": exc.params},
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled Exception at {request.url.path}: {str(exc)}")
    await capture_exception(exc, request=request)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )


app.include_router(auth_router)
app.include_router(refresh_token_router)
# Split by operation type across backend/mystic_auth/api/user_routes/.
# Registration order matters: the self-service router must come first, or
# the management routers' PUT /users/{user_email} would shadow PUT
# /users/me (Starlette matches routes in registration order app-wide).
app.include_router(user_self_service_router)
app.include_router(user_management_query_router)
app.include_router(user_management_update_router)
app.include_router(user_lifecycle_router)
# Split by sub-domain across backend/mystic_auth/api/pbac_routes/.
# policy_assignment_router defines /authorization/users/me/policies before
# its own /{user_email}/policies, so it must be included whole; no other
# cross-router ordering constraint exists.
app.include_router(policy_crud_router)
app.include_router(policy_history_router)
app.include_router(policy_assignment_router)
app.include_router(permission_assignment_router)
app.include_router(permission_catalog_router)
app.include_router(bulk_policy_router)
app.include_router(bulk_permission_router)
app.include_router(bulk_role_router)
app.include_router(authorization_check_router)
app.include_router(pbac_audit_log_router)
app.include_router(security_audit_router)
app.include_router(rate_limit_router)
app.include_router(health_router)


@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.APP_NAME}!"}
