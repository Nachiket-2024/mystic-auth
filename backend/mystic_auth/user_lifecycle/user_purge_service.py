from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit_log.audit_log_service import ACCOUNT_PURGED, log_security_event
from ..auth.refresh_token_logic.refresh_token_service import refresh_token_service
from ..authorization.caching.authorization_cache_service import authorization_cache_service
from ..logging.logging_config import get_logger
from ..user.user_crud_collector import user_crud
from .account_lifecycle_events import build_account_lifecycle_event

logger = get_logger(__name__)


class AccountNoLongerEligibleForPurgeError(Exception):
    """Raised when the account was soft-deleted at the time this purge was
    decided but is no longer soft-deleted by the time it actually runs
    (reactivated in between), or no longer exists at all. Does NOT apply to
    a permission holder purging a still-active account directly: that is a legitimate
    call shape with no deleted_at precondition to regress on. Both callers
    must handle this themselves, the same way they already handle
    TokenVersionUnavailableError."""

    def __init__(self, user_email: str):
        self.user_email = user_email
        super().__init__(f"{user_email} is no longer eligible for purge (reactivated or already purged)")


async def purge_user_account(
    user,
    db: AsyncSession,
    *,
    purged_by: str,
    request: Request | None = None,
) -> int:
    """
    Hard-delete path shared by the management `DELETE /users/{email}/purge` route
    (user_lifecycle_routes.py::purge_user) and the scheduled grace-period
    purge job (procrastinate_tasks/account_purge_tasks.py), so both go
    through the same revoke -> anonymize-history -> audit -> delete
    sequence instead of two independently-maintained copies.

    Takes a row lock on the user and, if it was already soft-deleted when
    this call was made, re-checks that it still is before doing anything
    irreversible: `user` may have been read well before this call (the
    nightly job reads its whole batch up front, then loops), and without
    this re-check a reactivation landing in that gap would still get
    permanently purged on the stale snapshot. The lock also closes the
    window against a reactivation racing in concurrently with this call
    itself, not just one that happened earlier. A permission holder purging a
    still-active account directly (never soft-deleted) is unaffected: there
    is no deleted_at precondition to regress on in that case. Raises
    AccountNoLongerEligibleForPurgeError if the row no longer exists, or if
    it was soft-deleted at call time but no longer is; both callers must
    handle this themselves.

    Sessions are revoked and the action audit-logged before the row is
    deleted: the audit write is what makes the action reviewable afterward,
    and `user_id`'s ON DELETE CASCADE would otherwise remove Manage Sessions
    rows out from under a post-delete revoke call.

    Raises TokenVersionUnavailableError, uncaught, if the account-version
    bump can't be confirmed (Postgres unavailable). Unlike a reversible soft
    delete, this fails closed on purpose since the row deletion hasn't
    happened yet at that point; better to block an irreversible purge on an
    unconfirmed revoke than delete an account while its sessions might still
    be alive. Both callers must handle this themselves.
    """
    user_email = user.email
    was_soft_deleted = user.deleted_at is not None

    locked_user = await user_crud.lock_by_id(user.id, db)
    if locked_user is None or (was_soft_deleted and locked_user.deleted_at is None):
        raise AccountNoLongerEligibleForPurgeError(user_email)
    user = locked_user

    revoked_count = await refresh_token_service.revoke_all_tokens_for_user(user_email, db)

    # security_audit_log/authorization_audit_log keep this account's email/IP
    # on every historical row, unanonymized, forever: deleting an account
    # (by the account holder, or by a permission holder) must never be a way to erase
    # the trail of what it did. Both tables are append-only for the app role
    # (mystic_auth_app has no UPDATE or DELETE on either - see Alembic
    # migrations 9c3e7f1a4b8d and the one that dropped the anonymize
    # columns' write access entirely) precisely so this can't be undone by
    # a compromised account or a malicious permission holder as the last step of
    # covering something up. See docs/mystic_auth/security/decisions-infra.md.
    await log_security_event(
        ACCOUNT_PURGED,
        db,
        user_email=user_email,
        success=True,
        request=request,
        metadata={"purged_by": purged_by, "sessions_revoked": revoked_count},
    )

    lifecycle_event = build_account_lifecycle_event(
        "purged",
        user,
        actor=purged_by,
        source="scheduled_grace_period_purge" if purged_by == "system:grace_period_purge" else "management",
    )
    await user_crud.delete(db_obj=user, db=db, lifecycle_event=lifecycle_event)

    # This email can be reused by a new signup. Without this invalidation, a
    # new account with the same email could transiently inherit the purged
    # user's stale cached policies/permissions, since the cache is keyed by
    # email, not user id. Best-effort: a cache miss just re-reads the
    # (now empty) database.
    await authorization_cache_service.invalidate_user_policies(user_email)
    await authorization_cache_service.invalidate_user_permissions(user_email)

    return revoked_count
