from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit_log.audit_log_service import ACCOUNT_PURGED, log_security_event
from ..auth.refresh_token_logic.refresh_token_service import refresh_token_service
from ..user_crud.user_crud_collector import user_crud


async def purge_user_account(
    user,
    db: AsyncSession,
    *,
    purged_by: str,
    request: Request | None = None,
) -> int:
    """
    Hard-delete path shared by the admin `DELETE /users/{email}/purge` route
    (user_lifecycle_routes.py::purge_user) and the scheduled grace-period
    purge job (taskiq_tasks/account_purge_tasks.py), so both go through the
    exact same revoke -> audit -> delete sequence rather than two
    independently-maintained copies of it.

    Sessions are revoked and the irreversible action is audit-logged before
    the row is deleted, same reasoning as the original purge_user: the audit
    write is what makes the action reviewable afterward, and `user_id`'s
    ON DELETE CASCADE would otherwise remove Manage Sessions rows out from
    under a post-delete revoke call.
    """
    user_email = user.email
    revoked_count = await refresh_token_service.revoke_all_tokens_for_user(user_email, db)

    await log_security_event(
        ACCOUNT_PURGED,
        db,
        user_email=user_email,
        success=True,
        request=request,
        metadata={"purged_by": purged_by, "sessions_revoked": revoked_count},
    )

    await user_crud.delete(db_obj=user, db=db)
    return revoked_count
