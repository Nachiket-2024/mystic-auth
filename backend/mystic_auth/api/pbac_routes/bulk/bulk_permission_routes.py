from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ....audit_log.audit_log_service import PERMISSION_GRANTED, PERMISSION_REVOKED
from ....authorization.context.request_context_builder import build_authorization_context
from ....authorization.dependencies.permission_route_dependencies import GRANT_DEPENDENCY, REVOKE_DEPENDENCY
from ....authorization.repositories.user_permission_repository import user_permission_repository
from ....authorization.schemas.bulk_schema import (
    BulkPermissionRemoveRequest,
    BulkPermissionRequest,
    BulkResponse,
    bulk_error,
    summarize,
)
from ....authorization.services.authorization_service import authorization_service
from ....authorization.services.bulk_notification import log_and_notify_bulk_success
from ....core.errors import AppError
from ....database.connection import database
from ....user.user_crud_collector import user_crud
from ....user.user_model import UserRole

router = APIRouter(prefix="/authorization", tags=["Authorization"])


@router.post("/bulk/permissions/assign", response_model=BulkResponse)
async def bulk_assign_permissions(
    body: BulkPermissionRequest,
    request: Request,
    current_user: dict = GRANT_DEPENDENCY,
    db: AsyncSession = Depends(database.get_session),
):
    """
    Grants one direct permission each to up to 200 (user_email, action,
    resource_type, conditions) items in one request, best-effort per item.
    Mirrors bulk_assign_policies' shape: route-level GRANT_DEPENDENCY gates
    "can attempt bulk grants at all", the per-item privilege-escalation
    guard is re-applied per item (a caller holding permissions:grant in
    general does not mean every specific action in this batch is one they
    hold themselves).
    """
    users_by_email = await user_crud.get_by_emails([item.user_email for item in body.items], db)

    context = build_authorization_context(request)
    grant_cache: dict[tuple[str, str], bool] = {}
    valid_items = []
    error_results = []
    for item in body.items:
        user = users_by_email.get(item.user_email)
        if user is None:
            error_results.append(bulk_error(item.user_email, item.action, "USER_NOT_FOUND"))
            continue
        if user.role == UserRole.system:
            error_results.append(bulk_error(item.user_email, item.action, "SYSTEM_USER_CANNOT_BE_MODIFIED"))
            continue
        try:
            await authorization_service.assert_authorized_to_grant(
                current_user["email"], [item.action], item.resource_type, db, context=context, cache=grant_cache
            )
        except AppError:
            error_results.append(bulk_error(item.user_email, item.action, "CANNOT_GRANT_UNHELD_ACTION"))
            continue
        valid_items.append((user, item))

    repo_results = await user_permission_repository.bulk_assign_permissions(
        valid_items, db, assigned_by=current_user["email"]
    )

    await log_and_notify_bulk_success(
        repo_results, PERMISSION_GRANTED, db,
        actor_email=current_user["email"], actor_field="granted_by", identifier_field="action",
    )

    return summarize(error_results + repo_results)


@router.post("/bulk/permissions/remove", response_model=BulkResponse)
async def bulk_remove_permissions(
    body: BulkPermissionRemoveRequest,
    request: Request,
    current_user: dict = REVOKE_DEPENDENCY,
    db: AsyncSession = Depends(database.get_session),
):
    """Removal counterpart to bulk_assign_permissions."""
    users_by_email = await user_crud.get_by_emails([item.user_email for item in body.items], db)

    context = build_authorization_context(request)
    grant_cache: dict[tuple[str, str], bool] = {}
    valid_items = []
    error_results = []
    for item in body.items:
        user = users_by_email.get(item.user_email)
        if user is None:
            error_results.append(bulk_error(item.user_email, item.action, "USER_NOT_FOUND"))
            continue
        if user.role == UserRole.system:
            error_results.append(bulk_error(item.user_email, item.action, "SYSTEM_USER_CANNOT_BE_MODIFIED"))
            continue
        try:
            await authorization_service.assert_authorized_to_grant(
                current_user["email"], [item.action], item.resource_type, db, context=context, cache=grant_cache
            )
        except AppError:
            error_results.append(bulk_error(item.user_email, item.action, "CANNOT_GRANT_UNHELD_ACTION"))
            continue
        valid_items.append((user, item))

    repo_results = await user_permission_repository.bulk_remove_permissions(valid_items, db)

    await log_and_notify_bulk_success(
        repo_results, PERMISSION_REVOKED, db,
        actor_email=current_user["email"], actor_field="revoked_by", identifier_field="action",
    )

    return summarize(error_results + repo_results)
