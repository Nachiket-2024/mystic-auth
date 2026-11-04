"""Per-item validation for the bulk permission and bulk policy routes.

Shared by assign and remove: the target user (and policy) exist, the user is not
the system account, and the caller really holds what is being granted or revoked.
A failed item is appended to error_results and the function returns None.
"""
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import AppError
from ...user.user_model import UserRole
from ..schemas.bulk_schema import BulkItemResult, bulk_error
from .authorization_service import authorization_service


async def resolve_permission_item(
    item, users_by_email: dict, current_user_email: str, db: AsyncSession, context, grant_cache: dict,
    error_results: list[BulkItemResult],
):
    """Shared per-item validation for both assign and remove: user exists,
    isn't system-role, and the caller actually holds the action being
    granted/revoked. Returns the resolved User, or None with the failure
    already appended to error_results."""
    user = users_by_email.get(item.user_email)
    if user is None:
        error_results.append(bulk_error(item.user_email, item.action, "USER_NOT_FOUND"))
        return None
    if user.role == UserRole.system:
        error_results.append(bulk_error(item.user_email, item.action, "SYSTEM_USER_CANNOT_BE_MODIFIED"))
        return None
    try:
        await authorization_service.assert_authorized_to_grant(
            current_user_email, [item.action], item.resource_type, db,
            context=context, conditions=getattr(item, "conditions", None), cache=grant_cache,
        )
    except AppError:
        error_results.append(bulk_error(item.user_email, item.action, "CANNOT_GRANT_UNHELD_ACTION"))
        return None
    return user


async def resolve_policy_item(
    item, users_by_email: dict, policies_by_name: dict, current_user_email: str, db: AsyncSession, context,
    grant_cache: dict, error_results: list[BulkItemResult],
):
    """Shared per-item validation for both assign and remove: user and
    policy exist, user isn't system-role, and the caller actually holds
    every action the policy grants. Returns the resolved (User, Policy), or
    None with the failure already appended to error_results."""
    user = users_by_email.get(item.user_email)
    policy = policies_by_name.get(item.policy_name)
    if user is None:
        error_results.append(bulk_error(item.user_email, item.policy_name, "USER_NOT_FOUND"))
        return None
    if policy is None:
        error_results.append(bulk_error(item.user_email, item.policy_name, "POLICY_NOT_FOUND"))
        return None
    if user.role == UserRole.system:
        error_results.append(bulk_error(item.user_email, item.policy_name, "SYSTEM_USER_CANNOT_BE_MODIFIED"))
        return None
    try:
        await authorization_service.assert_authorized_to_grant(
            current_user_email, policy.actions, policy.resource_type, db,
            context=context, conditions=policy.conditions, cache=grant_cache,
        )
    except AppError:
        error_results.append(bulk_error(item.user_email, item.policy_name, "CANNOT_GRANT_UNHELD_ACTION"))
        return None
    return user, policy
