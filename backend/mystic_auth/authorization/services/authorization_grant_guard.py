from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import AppError
from ..permissions import Permission

# This app's known-sensitive actions; see assert_authorized_to_grant below
# for why only these are escalation-guarded.
_KNOWN_SENSITIVE_ACTIONS = frozenset(permission.value for permission in Permission)


async def assert_authorized_to_grant(
    caller_email: str,
    actions: list[str],
    resource_type: str,
    db: AsyncSession,
    context: dict | None = None,
    cache: dict[tuple[str, str], bool] | None = None,
) -> None:
    """
    Guards against privilege escalation. `caller_email` is the user
    creating/updating/assigning a policy; `actions` is the full set of
    actions that would end up granted. For every action in `actions` that
    is one of this app's own known-sensitive actions (Permission's fixed
    vocabulary), confirms the caller already holds it, raising HTTP 403
    on the first one they don't. Anything outside that vocabulary (a
    downstream app's own business action, e.g. "projects:read") is
    skipped: without this guard, holding only policies:create+assign
    (without system_superuser) would let a caller mint an all-powerful
    policy and assign it to themselves.

    `context` should be the same request context the route's own
    require_authorization dependency built. Without it, the "do you
    already hold this" check evaluates with no IP/time/security_context,
    failing closed for a caller who holds the action only via a
    context-dependent policy (e.g. network- or time-restricted). Callers
    with no real request (background tasks) can omit it; that's
    conservative (may under-grant, never over-grants).

    Scoped to Permission's fixed vocabulary, not every action string:
    policies:create/assign is a general-purpose authoring capability, not
    itself the protected resource, so only this app's built-in identity/
    authorization actions need guarding here.

    Imports AuthorizationService locally to avoid a circular import
    (authorization_service.py delegates its own assert_authorized_to_grant
    here).

    `cache`, when given, is an (action, resource_type) -> allowed dict the
    caller reuses across repeated calls in the same request (e.g. a
    bulk-assign loop). Safe to memoize without a TTL since caller_email
    and context are fixed for the request's duration; avoids re-running
    evaluation for the same action across many bulk items.
    """
    from .authorization_service import AuthorizationService

    for action in actions:
        if action not in _KNOWN_SENSITIVE_ACTIONS:
            continue
        cache_key = (action, resource_type)
        if cache is not None and cache_key in cache:
            allowed = cache[cache_key]
        else:
            allowed = await AuthorizationService.authorize(caller_email, action, resource_type, db, context=context)
            if cache is not None:
                cache[cache_key] = allowed
        if not allowed:
            raise AppError(
                status_code=status.HTTP_403_FORBIDDEN,
                code="CANNOT_GRANT_UNHELD_ACTION",
                detail=f"Cannot grant action '{action}': you do not hold it yourself",
                params={"action": action},
            )
