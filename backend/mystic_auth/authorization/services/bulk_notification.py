import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from ...audit_log.audit_log_service import log_security_event
from ...authorization.schemas.bulk_schema import BulkItemResult
from ...user_session.session_events import publish_permissions_changed


async def log_and_notify_bulk_success(
    repo_results: list[BulkItemResult],
    event_type: str,
    db: AsyncSession,
    *,
    actor_email: str,
    actor_field: str,
    identifier_field: str,
    notify_permissions_changed: bool = True,
) -> None:
    """
    Shared tail of every bulk PBAC route (bulk_policy_routes.py /
    bulk_permission_routes.py / bulk_role_routes.py): audit-log each
    successful item, then nudge affected users' open tabs.

    Audit logging stays one call per successful item - each is a distinct
    event worth its own row. The permissions-changed notification is
    different: it's a "something changed, go check" signal
    (publish_permissions_changed), not an event record, so firing it once
    per *user* rather than once per item avoids redundant pub/sub messages
    when a batch targets the same user more than once (e.g. two policies
    assigned to the same email in one request), and the unique sends run
    concurrently rather than one at a time.
    """
    notified_emails: set[str] = set()
    for result in repo_results:
        if result.status != "success":
            continue
        await log_security_event(
            event_type,
            db,
            user_email=result.user_email,
            success=True,
            metadata={actor_field: actor_email, identifier_field: result.identifier, "bulk": True},
        )
        if notify_permissions_changed:
            notified_emails.add(result.user_email)

    if notified_emails:
        await asyncio.gather(*(publish_permissions_changed(email) for email in notified_emails))
