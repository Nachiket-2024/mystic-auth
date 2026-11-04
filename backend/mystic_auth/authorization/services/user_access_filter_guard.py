"""Guard for user-list filters that reveal who holds which access."""
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...user.user_crud_collector import PermissionSource
from ..context.request_context_builder import build_authorization_context
from ..permissions import Permission
from .authorization_service import authorization_service


async def require_policy_visibility_for_access_filters(
    request: Request,
    current_user: dict,
    db: AsyncSession,
    policy: str | None,
    permission: Permission | None,
    permission_source: PermissionSource | None,
) -> None:
    """Filtering the user list by policy or permission reveals who holds which
    access, which is exactly what GET /authorization/users/{email}/policies and
    /policies/{name}/holders protect behind policies:read. Without this check a
    caller with only users:list_all could rebuild the whole access map by
    probing ?policy= and ?permission=, so those filters need the same action.
    A caller who sets none of them is unaffected."""
    if policy is None and permission is None and permission_source is None:
        return
    await authorization_service.require(
        user_email=current_user["email"],
        action=Permission.POLICIES_READ.value,
        resource_type="policies",
        db=db,
        context=build_authorization_context(request),
    )
