from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth.passkeys.passkey_operator_service import get_manageable_target, revoke_as_operator
from ...auth.passkeys.passkey_service import passkey_service
from ...authorization.dependencies.authorization_dependency import require_authorization
from ...authorization.permissions import Permission
from ...database.connection import database

# Incident-response view of ANOTHER user's passkeys. Access is decided purely by
# the users:manage_passkeys permission. A holder can see which passkeys exist
# (name and dates only) and revoke them, but can never add one or read
# credential material, so this cannot be used to sign in as the user.
# A user manages their own passkeys through /auth/passkeys instead, behind a
# recent identity check.
router = APIRouter(prefix="/users", tags=["Users"])

_RESOURCE_TYPE = "users"


@router.get("/{user_email}/passkeys")
async def list_user_passkeys(
    user_email: str,
    request: Request,
    current_user: dict = Depends(require_authorization(Permission.USERS_MANAGE_PASSKEYS.value, _RESOURCE_TYPE)),
    db: AsyncSession = Depends(database.get_session),
):
    user = await get_manageable_target(user_email, current_user, request, db)
    rows = await passkey_service.list_credentials(user.id, db)
    return [
        {"id": row.id, "name": row.name, "created_at": row.created_at, "last_used_at": row.last_used_at}
        for row in rows
    ]


@router.delete("/{user_email}/passkeys")
async def revoke_all_user_passkeys(
    user_email: str,
    request: Request,
    current_user: dict = Depends(require_authorization(Permission.USERS_MANAGE_PASSKEYS.value, _RESOURCE_TYPE)),
    db: AsyncSession = Depends(database.get_session),
):
    user = await get_manageable_target(user_email, current_user, request, db)
    return await revoke_as_operator(user, None, "all", current_user, request, db)


@router.delete("/{user_email}/passkeys/{credential_id}")
async def revoke_user_passkey(
    user_email: str,
    credential_id: int,
    request: Request,
    current_user: dict = Depends(require_authorization(Permission.USERS_MANAGE_PASSKEYS.value, _RESOURCE_TYPE)),
    db: AsyncSession = Depends(database.get_session),
):
    user = await get_manageable_target(user_email, current_user, request, db)
    return await revoke_as_operator(user, [credential_id], "single", current_user, request, db)


