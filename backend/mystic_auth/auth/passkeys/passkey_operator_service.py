"""An operator managing ANOTHER user's passkeys (incident response).

Used by the users:manage_passkeys routes. The holder can list and remove a
user's passkeys, never add one or read credential material.
"""
from fastapi import Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...audit_log.audit_log_service import PASSKEY_REMOVED, log_security_event
from ...authorization.privilege_hierarchy import guard_privileged_target
from ...core.errors import AppError
from ...emails.email_normalization import normalize_email
from ...user.user_crud_collector import user_crud
from ...user.user_model import UserRole
from .passkey_notification_service import notify_passkeys_removed_by_operator
from .passkey_service import passkey_service


async def get_manageable_target(user_email: str, current_user: dict, request: Request, db: AsyncSession):
    """The user whose passkeys an operator may manage, or an AppError."""
    user = await user_crud.get_by_email(normalize_email(user_email), db)
    if user is None:
        raise AppError(status_code=status.HTTP_404_NOT_FOUND, code="USER_NOT_FOUND", detail="User not found")
    if user.role == UserRole.system:
        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code="SYSTEM_USER_PASSKEYS_CANNOT_BE_MANAGED",
            detail="System user passkeys cannot be managed",
        )
    # Same rule as every other action on a privileged target account: the
    # target's role is only metadata that selects which extra permission
    # (users:manage_privileged) is required.
    await guard_privileged_target(current_user, user.role, request, db)
    return user


async def revoke_as_operator(user, credential_ids, scope: str, current_user: dict, request: Request, db: AsyncSession) -> dict:
    # Callers use the self-service flow for their own passkeys, which requires
    # the identity re-check this route does not have.
    if user.email == current_user["email"]:
        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code="CANNOT_MANAGE_OWN_PASSKEYS_HERE",
            detail="Use your account settings to manage your own passkeys",
        )
    removed = await passkey_service.remove_credentials(user.id, credential_ids, db)
    if removed == 0:
        raise AppError(status_code=status.HTTP_404_NOT_FOUND, code="PASSKEY_NOT_FOUND", detail="Passkey not found")
    await log_security_event(
        PASSKEY_REMOVED,
        db,
        user_email=user.email,
        request=request,
        metadata={"count": removed, "scope": scope, "removed_by": current_user["email"]},
    )
    await notify_passkeys_removed_by_operator(user.email, removed)
    return {"detail": "Passkeys removed", "removed": removed}
