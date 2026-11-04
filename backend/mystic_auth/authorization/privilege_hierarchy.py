from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..user.user_model import UserRole
from .context.request_context_builder import build_authorization_context
from .permissions import Permission
from .services.authorization_service import authorization_service

_RESOURCE_TYPE = "users"


async def guard_privileged_target(
    current_user: dict, target_role: UserRole | None, request: Request, db: AsyncSession
) -> None:
    """Require users:manage_privileged before a route that mutates an account
    (field update, role change, deactivate, purge, reactivate) proceeds
    against a target whose role is admin.

    This stays PBAC, not RBAC: target_role is read purely as resource
    metadata to decide *which* permission the action needs (the same role
    USERS_ASSIGN_SYSTEM_ROLE already plays for system-role targets) - the
    actual authorization decision is still "does this caller hold the
    required action", routed through the same authorization_service every
    other check in this codebase uses. It never compares the caller's own
    role to anything; a caller with no role field at all, or role=user, can
    still pass this check if a policy grants them users:manage_privileged.

    System-role targets already have their own stricter, unconditional
    guard at each call site (no permission can ever authorize touching the
    system account through these routes), applied before this function is
    even called. This function itself is a no-op for role=system (same as
    role=user): it only acts when target_role is exactly admin.
    """
    if target_role != UserRole.admin:
        return

    await authorization_service.require(
        user_email=current_user["email"],
        action=Permission.USERS_MANAGE_PRIVILEGED.value,
        resource_type=_RESOURCE_TYPE,
        db=db,
        context=build_authorization_context(request),
    )
