from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...audit_log.audit_log_service import USER_FIELDS_UPDATED, USER_ROLE_CHANGED, log_security_event
from ...auth.password_logic.password_service import password_service

# Session invalidation on account deletion: the same mechanism logout-all
# uses, reused here so a soft-deleted/purged account's existing refresh tokens
# can't be used to mint a fresh access token even though
# refresh_token_service.refresh_tokens() itself doesn't check the database
# (it's Valkey/JWT-only by design, see its own docstring).
from ...auth.refresh_token_logic.refresh_token_service import refresh_token_service
from ...auth.token_logic.token_version_store import TokenVersionUnavailableError

# Every real authorization check must build context from the actual request
# the same way, see authorization_dependency.py.
from ...authorization.context.request_context_builder import build_authorization_context
from ...authorization.dependencies.authorization_dependency import require_authorization

# PBAC action vocabulary and policy-based authorization. Replaces the removed
# static role-permission helpers.
from ...authorization.permissions import Permission
from ...authorization.privilege_hierarchy import guard_privileged_target
from ...authorization.services.authorization_service import authorization_service
from ...core.errors import AppError
from ...database.connection import database
from ...emails.email_normalization import normalize_email
from ...logging.logging_config import get_logger
from ...user.user_crud_collector import user_crud
from ...user.user_crud_modules.user_update_payload_preparation import prepare_update_data

# UserRole is only used for target-account guards such as protecting the
# reserved system account from generic endpoints. It is resource metadata, not
# caller authorization; PBAC policies still decide access.
from ...user.user_model import UserRole
from ...user.user_schema import UserManagementUpdateResponse, UserRoleUpdate, UserUpdate
from ..get_or_404.get_or_404 import get_or_404

# Management field updates on another user's account, split out from
# user_management_query_routes.py (read-only) and user_lifecycle_routes.py
# (account state transitions). main.py registers this router after
# self-service routes so /{user_email} cannot shadow /users/me or /users/stats.
router = APIRouter(prefix="/users", tags=["Users"])

logger = get_logger(__name__)

_RESOURCE_TYPE = "users"


@router.put("/{user_email}", response_model=UserManagementUpdateResponse)
async def update_any_user(
    user_email: str,
    update_data: UserUpdate,
    request: Request,
    current_user: dict = Depends(require_authorization(Permission.USERS_UPDATE_ANY.value, _RESOURCE_TYPE)),
    db: AsyncSession = Depends(database.get_session)
):
    user_email = normalize_email(user_email)
    user = await get_or_404(user_crud.get_by_email(user_email, db), "User not found", code="USER_NOT_FOUND")

    # UserUpdate allows setting `password`, so without this guard anyone with
    # users:update_any could overwrite the system superuser's password and log
    # in as it.
    if user.role == UserRole.system:
        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code="SYSTEM_USER_CANNOT_BE_MODIFIED",
            detail="System user cannot be modified"
        )

    # Same password-overwrite risk as the system guard above, one tier down:
    # without this, the narrowest grant of users:update_any (e.g. just the
    # user_management policy, no further grant) could set the password of any
    # account holding the admin role and log in as it. See privilege_hierarchy.py.
    await guard_privileged_target(current_user, user.role, request, db)

    if (
        update_data.password is not None
        and user.hashed_password is not None
        and await password_service.verify_password(update_data.password, user.hashed_password)
    ):
        raise AppError(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="PASSWORD_MUST_DIFFER_FROM_CURRENT",
            detail="New password must be different from the current password",
        )

    prepared_data = await prepare_update_data(update_data)
    updated_user = await user_crud.update(db_obj=user, update_data=prepared_data, db=db)

    # A management-driven password change must revoke the target's existing
    # sessions too. sessions_revoked stays None unless a revoke was
    # attempted: the password write always succeeds regardless.
    sessions_revoked = None
    if "hashed_password" in prepared_data:
        sessions_revoked = True
        try:
            await refresh_token_service.revoke_all_tokens_for_user(user_email, db)
        except TokenVersionUnavailableError:
            sessions_revoked = False
            logger.error("Could not confirm session revocation on management password change for %s", user_email)

    await log_security_event(
        USER_FIELDS_UPDATED,
        db,
        user_email=user_email,
        success=True,
        request=request,
        metadata={
            "updated_by": current_user["email"],
            "fields": sorted(prepared_data.keys()),
            "sessions_revoked": sessions_revoked,
        },
    )

    response_payload = UserManagementUpdateResponse.model_validate(updated_user)
    response_payload.sessions_revoked = sessions_revoked
    return response_payload


@router.patch("/{user_email}/role")
async def update_user_role(
    user_email: str,
    role_data: UserRoleUpdate,
    request: Request,
    current_user: dict = Depends(require_authorization(Permission.USERS_ASSIGN_ROLE.value, _RESOURCE_TYPE)),
    db: AsyncSession = Depends(database.get_session)
):
    user_email = normalize_email(user_email)
    user = await get_or_404(user_crud.get_by_email(user_email, db), "User not found", code="USER_NOT_FOUND")

    if user.role == UserRole.system:
        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code="SYSTEM_USER_ROLE_CANNOT_BE_CHANGED",
            detail="System user role cannot be changed"
        )

    # users:assign_role only proves "may relabel accounts", not "may relabel
    # itself" - without this, its holder could self-promote to "admin" with
    # no further check. Harmless while role stays display-only, but becomes
    # real the moment any downstream code adds an `if role == "admin"`
    # shortcut. Blocks every target role, not just "system" (that case has
    # its own guard below).
    if user_email == current_user["email"]:
        raise AppError(
            status_code=status.HTTP_403_FORBIDDEN,
            code="CANNOT_CHANGE_OWN_ROLE",
            detail="You cannot change your own role",
        )

    # See privilege_hierarchy.py: the narrowest grant of users:assign_role
    # must not be enough to demote (or re-promote) an account holding the admin role.
    # Promoting a user *to* admin is intentionally not gated here beyond the
    # existing users:assign_role check - granting the admin role is the normal,
    # expected use of that permission.
    await guard_privileged_target(current_user, user.role, request, db)

    # Assigning the system role requires the separate, more sensitive
    # users:assign_system_role authorization. This can't be a static
    # per-route dependency like the others since it depends on *which* role is
    # being requested in the body, not just who's calling, so it goes
    # through the same centralized authorization_service the route-level
    # dependency itself uses, never a role check.
    if role_data.role == UserRole.system:
        await authorization_service.require(
            user_email=current_user["email"],
            action=Permission.USERS_ASSIGN_SYSTEM_ROLE.value,
            resource_type=_RESOURCE_TYPE,
            db=db,
            context=build_authorization_context(request),
        )

    old_role = user.role.value if user.role else None
    await user_crud.update_role(db_obj=user, role=role_data.role, db=db)

    await log_security_event(
        USER_ROLE_CHANGED,
        db,
        user_email=user_email,
        success=True,
        request=request,
        metadata={"changed_by": current_user["email"], "old_role": old_role, "new_role": role_data.role.value},
    )

    return {"detail": f"User {user_email} role updated to {role_data.role.value}"}
