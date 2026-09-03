from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit_log.audit_log_service import ACCOUNT_PURGED, log_security_event
from ..auth.refresh_token_logic.refresh_token_service import refresh_token_service
from ..authorization.caching.authorization_cache_service import authorization_cache_service
from ..user.user_crud_collector import user_crud


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
    purge job (procrastinate_tasks/account_purge_tasks.py), so both go
    through the same revoke -> audit -> delete sequence instead of two
    independently-maintained copies.

    Sessions are revoked and the action audit-logged before the row is
    deleted: the audit write is what makes the action reviewable afterward,
    and `user_id`'s ON DELETE CASCADE would otherwise remove Manage Sessions
    rows out from under a post-delete revoke call.

    Raises TokenVersionUnavailableError, uncaught, if the account-version
    bump can't be confirmed (Redis unreachable). Unlike a reversible soft
    delete, this fails closed on purpose since the row deletion hasn't
    happened yet at that point; better to block an irreversible purge on an
    unconfirmed revoke than delete an account while its sessions might still
    be alive. Both callers must handle this themselves.
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

    # This email can be reused by a new signup. Without this invalidation, a
    # new account with the same email could transiently inherit the purged
    # user's stale cached policies/permissions, since the cache is keyed by
    # email, not user id. Best-effort: a cache miss just re-reads the
    # (now empty) database.
    await authorization_cache_service.invalidate_user_policies(user_email)
    await authorization_cache_service.invalidate_user_permissions(user_email)

    return revoked_count
