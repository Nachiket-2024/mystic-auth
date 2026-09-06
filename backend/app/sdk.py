"""
Public extension surface for domain/feature code built on top of this
template (see docs/mystic_auth/template-usage/overview.md).

Import from HERE, not internal paths like
`mystic_auth.authorization.dependencies.authorization_dependency` directly:
one file to discover what's available, and one file to reconcile when
pulling in upstream template updates. main.py follows the same rule and
never reaches into `mystic_auth/` directly.

Everything below is a straight re-export; see the original module's
docstring for the "why" behind any given piece.

DO NOT hand-edit this file. It's a drop-in from upstream and the one file a
`scripts/mystic_auth/upstream-sync/sync-upstream.sh` sync is expected to touch, so local edits here
turn a clean sync into a manual conflict. Add your own re-exports to
app_sdk.py instead: it's kept empty by upstream for exactly this purpose.
"""

import importlib

# `mystic_auth` is a sibling of `app`, not a child, so neither a relative
# nor a hardcoded absolute import works in both the Docker image (top-level
# `mystic_auth`) and the test suite (`backend.mystic_auth...`). Deriving the
# prefix from __package__ keeps this working in both, and resolves to the
# same module objects the rest of that context already imported, which
# matters since conftest.py mutates `database.engine` and expects the app
# under test to see the same instance.
_pkg_parent = __package__.rsplit(".", 1)[0] if __package__ and "." in __package__ else ""
_mystic_auth_root = f"{_pkg_parent}.mystic_auth" if _pkg_parent else "mystic_auth"


def _m(path: str):
    return importlib.import_module(f"{_mystic_auth_root}.{path}")


# PBAC, see docs/mystic_auth/authorization/architecture/README.md
Permission = _m("authorization.permissions").Permission
PERMISSION_CATALOG = _m("authorization.permissions_catalog").PERMISSION_CATALOG
PermissionCatalogEntry = _m("authorization.permissions_catalog").PermissionCatalogEntry
require_authorization = _m("authorization.dependencies.authorization_dependency").require_authorization
authorization_service = _m("authorization.services.authorization_service").authorization_service
build_authorization_context = _m("authorization.context.request_context_builder").build_authorization_context
AuthorizationDecision = _m("authorization.evaluators.authorization_decision").AuthorizationDecision

# Authentication, see docs/mystic_auth/authentication/overview.md
get_current_user = _m("auth.current_user.current_user_dependency").get_current_user
SecurityHeadersMiddleware = _m("auth.security.security_headers_middleware").SecurityHeadersMiddleware

# Database: Depends(database.get_session) in a route signature
database = _m("database.connection").database
# Settings: add your own fields to Settings in core/settings.py, read them
# from here rather than os.environ directly
settings = _m("core.settings").settings

# Small route helpers
get_or_404 = _m("api.get_or_404.get_or_404").get_or_404

# Machine-readable error codes for frontend translation, see
# docs/mystic_auth/translations/overview/README.md
AppError = _m("core.errors").AppError

# Routers, mounted on the FastAPI app in main.py
auth_router = _m("api.auth_routes.auth_routes").router
refresh_token_router = _m("api.auth_routes.refresh_token_routes").router
user_self_service_router = _m("api.user_routes.user_self_service_routes").router
user_management_query_router = _m("api.user_routes.user_management_query_routes").router
user_management_update_router = _m("api.user_routes.user_management_update_routes").router
user_lifecycle_router = _m("api.user_routes.user_lifecycle_routes").router
policy_crud_router = _m("api.pbac_routes.policies.policy_crud_routes").router
policy_history_router = _m("api.pbac_routes.policies.policy_history_routes").router
policy_assignment_router = _m("api.pbac_routes.policies.policy_assignment_routes").router
permission_assignment_router = _m("api.pbac_routes.permissions.permission_assignment_routes").router
permission_catalog_router = _m("api.pbac_routes.permissions.permission_catalog_routes").router
bulk_policy_router = _m("api.pbac_routes.bulk.bulk_policy_routes").router
bulk_permission_router = _m("api.pbac_routes.bulk.bulk_permission_routes").router
bulk_role_router = _m("api.pbac_routes.bulk.bulk_role_routes").router
authorization_check_router = _m("api.pbac_routes.authorization_check_routes").router
pbac_audit_log_router = _m("api.pbac_routes.pbac_audit_log_routes").router
security_audit_router = _m("api.audit_log_routes.audit_log_routes").router
rate_limit_router = _m("api.rate_limit_routes.rate_limit_routes").router
health_router = _m("api.health_routes.health_routes").router

# Display/grouping metadata only, never a gating decision, see
# docs/mystic_auth/security/decisions-auth.md#role-is-never-used-to-decide-access
User = _m("user.user_model").User
UserRole = _m("user.user_model").UserRole
UserCreate = _m("user.user_schema").UserCreate
UserRead = _m("user.user_schema").UserRead
UserSelfDeleteRequest = _m("user.user_schema").UserSelfDeleteRequest
UserSelfUpdateResponse = _m("user.user_schema").UserSelfUpdateResponse
UserStatsRead = _m("user.user_schema").UserStatsRead
UserUpdate = _m("user.user_schema").UserUpdate

_policy_schema = _m("authorization.schemas.policy_schema")
PolicyCreate = _policy_schema.PolicyCreate
PolicyRead = _policy_schema.PolicyRead
PolicyUpdate = _policy_schema.PolicyUpdate
PolicyAssignmentRequest = _policy_schema.PolicyAssignmentRequest
PolicyActionRevocationRequest = _policy_schema.PolicyActionRevocationRequest
UserPoliciesRead = _policy_schema.UserPoliciesRead
AuthorizationCheckRequest = _policy_schema.AuthorizationCheckRequest
AuthorizationCheckResponse = _policy_schema.AuthorizationCheckResponse

_permission_schema = _m("authorization.schemas.permission_schema")
PermissionAssignmentRequest = _permission_schema.PermissionAssignmentRequest
PermissionCatalogEntryRead = _permission_schema.PermissionCatalogEntryRead
UserPermissionRead = _permission_schema.UserPermissionRead
UserPermissionsRead = _permission_schema.UserPermissionsRead

# Redis client singleton, closed on shutdown in main.py's lifespan
redis_client = _m("redis.client").redis_client

# Procrastinate app singleton (background email + scheduled account-purge
# tasks, see docs/mystic_auth/background-workers/procrastinate.md). Opened/
# closed alongside the DB engine/Redis client in main.py's lifespan, since
# `.defer_async()` calls from request handlers need its connector's psycopg
# pool already open.
procrastinate_app = _m("procrastinate_tasks.procrastinate_app").app

# Logging/observability middleware and helpers, wired up in main.py
LoggingMiddleware = _m("logging.logging_middleware").LoggingMiddleware
CorrelationIdMiddleware = _m("logging.correlation_id_middleware").CorrelationIdMiddleware
get_logger = _m("logging.logging_config").get_logger

# Error monitoring: init_sentry() runs once at import time; capture_exception()
# reports a caught exception the same way an unhandled one auto-reports.
# Both are safe no-ops when SENTRY_DSN is unset. watch_for_late_dsn() runs as
# a background task to catch Bugsink's DSN on a slow/fresh boot, after
# init_sentry() already found nothing set. See
# docs/mystic_auth/error-monitoring/overview.md.
_sentry_service = _m("error_monitoring.sentry_service")
init_sentry = _sentry_service.init_sentry
capture_exception = _sentry_service.capture_exception
watch_for_late_dsn = _sentry_service.watch_for_late_dsn

# Called once from main.py's lifespan teardown, before redis_client is
# closed, so any open GET /auth/session-events SSE connection notices the
# shutdown immediately and ends its stream instead of holding the process
# open past its graceful-shutdown timeout. See
# user_session/session_events.py for the full reasoning.
signal_session_events_shutdown = _m("user_session.session_events").signal_shutdown

__all__ = [
    "Permission",
    "PERMISSION_CATALOG",
    "PermissionCatalogEntry",
    "require_authorization",
    "authorization_service",
    "build_authorization_context",
    "AuthorizationDecision",
    "get_current_user",
    "SecurityHeadersMiddleware",
    "database",
    "settings",
    "get_or_404",
    "AppError",
    "auth_router",
    "refresh_token_router",
    "user_self_service_router",
    "user_management_query_router",
    "user_management_update_router",
    "user_lifecycle_router",
    "policy_crud_router",
    "policy_history_router",
    "policy_assignment_router",
    "permission_assignment_router",
    "permission_catalog_router",
    "bulk_policy_router",
    "bulk_permission_router",
    "bulk_role_router",
    "authorization_check_router",
    "pbac_audit_log_router",
    "security_audit_router",
    "rate_limit_router",
    "health_router",
    "User",
    "UserRole",
    "UserCreate",
    "UserRead",
    "UserSelfDeleteRequest",
    "UserSelfUpdateResponse",
    "UserStatsRead",
    "UserUpdate",
    "PolicyCreate",
    "PolicyRead",
    "PolicyUpdate",
    "PolicyAssignmentRequest",
    "PolicyActionRevocationRequest",
    "UserPoliciesRead",
    "AuthorizationCheckRequest",
    "AuthorizationCheckResponse",
    "PermissionAssignmentRequest",
    "PermissionCatalogEntryRead",
    "UserPermissionRead",
    "UserPermissionsRead",
    "redis_client",
    "procrastinate_app",
    "LoggingMiddleware",
    "CorrelationIdMiddleware",
    "get_logger",
    "init_sentry",
    "capture_exception",
    "watch_for_late_dsn",
    "signal_session_events_shutdown",
]
