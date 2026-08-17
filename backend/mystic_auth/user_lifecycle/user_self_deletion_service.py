from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit_log.audit_log_service import ACCOUNT_DELETED_SELF, log_security_event
from ..auth.refresh_token_logic.refresh_token_service import refresh_token_service
from ..user_crud.user_crud_collector import user_crud


async def finalize_self_deletion(user, db: AsyncSession, *, request: Request | None = None) -> int:
    """
    Soft-delete + session revocation + audit logging shared by both
    self-service delete entry points: the synchronous password-confirmed
    path (user_self_service_routes.py::delete_my_account, for accounts with
    a password) and the async email-confirmed path for OAuth-only accounts
    (account_deletion_service.py::confirm_deletion, reached via POST
    /users/me/confirm-delete). Keeping one call site means the two can never
    drift apart, same reasoning as purge_user_account being shared between
    the admin purge route and the scheduled grace-period job.
    """
    email = user.email
    await user_crud.soft_delete(db_obj=user, db=db)

    # Same reasoning as delete_any_user/purge_user_account: is_active=False
    # alone doesn't stop an already-issued refresh token from minting fresh
    # access tokens until it expires on its own, since refresh_tokens() is
    # Redis/JWT-only and never re-checks the database.
    revoked_count = await refresh_token_service.revoke_all_tokens_for_user(email, db)

    await log_security_event(
        ACCOUNT_DELETED_SELF,
        db,
        user_email=email,
        success=True,
        request=request,
        metadata={"deleted_by": email, "self_initiated": True, "sessions_revoked": revoked_count},
    )

    return revoked_count
