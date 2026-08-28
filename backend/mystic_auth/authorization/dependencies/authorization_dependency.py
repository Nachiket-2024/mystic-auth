from collections.abc import Awaitable, Callable

from fastapi import Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth.current_user.current_user_dependency import get_current_user
from ...core.errors import AppError
from ...database.connection import database
from ..context.request_context_builder import build_authorization_context
from ..services.authorization_service import authorization_service


def require_authorization(action: str, resource_type: str) -> Callable[..., Awaitable[dict]]:
    """
    Returns a FastAPI dependency usable as
    `Depends(require_authorization("users:list_all", "users"))` that
    authenticates the caller, builds the request's authorization context
    (real connection/server clock only, never anything client-supplied,
    see context/request_context_builder.py), and delegates the actual
    decision entirely to AuthorizationService.require. On success it
    returns the authenticated current_user dict for the route to use.

    This is the PBAC replacement for the RBAC-era
    authorization.permission_checker.require_permission (removed): routes
    declare *what action on what resource* they need; the authorization
    service and policy evaluation engine behind it decide *who currently
    has that*, based entirely on assigned policies. No role ever enters
    this decision, and this dependency itself never inspects
    current_user["role"].
    """
    async def dependency(
        request: Request,
        current_user: dict = Depends(get_current_user),
        db: AsyncSession = Depends(database.get_session),
    ) -> dict:
        context = build_authorization_context(request)

        await authorization_service.require(
            user_email=current_user["email"],
            action=action,
            resource_type=resource_type,
            db=db,
            context=context,
        )

        return current_user

    return dependency


def require_any_authorization(checks: list[tuple[str, str]]) -> Callable[..., Awaitable[dict]]:
    """
    Returns a FastAPI dependency usable as
    `Depends(require_any_authorization([("permissions:read", "permissions"),
    ("policies:create", "policies")]))`: allows the request through if the
    caller holds ANY ONE of the given (action, resource_type) pairs, not
    all of them, rather than composing multiple require_authorization
    dependencies (FastAPI's `Depends` has no built-in OR).

    For a route that's a genuine prerequisite of more than one otherwise-
    independent action - e.g. GET /permissions/catalog is needed both by
    the standalone Permissions page (permissions:read) and by the Policy
    create/edit form (policies:create / policies:update), which has no
    reason to also hold permissions:read - gating it behind a single action
    would deny a caller who only holds one of the actions that legitimately
    needs it. Each candidate is checked via the non-raising, non-logging
    `authorize_detailed()` (not `authorize()`/`require()`): these are
    hypothetical probes ("would this one candidate let the caller through"),
    not real per-action decisions, so a caller holding only the last
    candidate in the list must not get a "denied" audit row for every
    earlier candidate they were never actually attempting. The one real
    decision - whichever candidate actually let the caller through - is
    logged via `authorize()` once a match is found, exactly as
    require_authorization logs its single check.
    """
    async def dependency(
        request: Request,
        current_user: dict = Depends(get_current_user),
        db: AsyncSession = Depends(database.get_session),
    ) -> dict:
        context = build_authorization_context(request)

        for action, resource_type in checks:
            decision = await authorization_service.authorize_detailed(
                user_email=current_user["email"],
                action=action,
                resource_type=resource_type,
                db=db,
                context=context,
            )
            if decision.allowed:
                # Re-check (and this time log) only the candidate that
                # actually succeeded, so the audit trail records the real
                # decision without the earlier candidates' spurious denials.
                await authorization_service.authorize(
                    user_email=current_user["email"],
                    action=action,
                    resource_type=resource_type,
                    db=db,
                    context=context,
                )
                return current_user

        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code="INSUFFICIENT_PERMISSIONS",
            detail="Insufficient permissions",
        )

    return dependency
