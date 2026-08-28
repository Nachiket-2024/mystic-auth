from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import AppError
from ..permissions import Permission

# The app's own fixed, known-sensitive action vocabulary: see
# assert_authorized_to_grant below for why only these are escalation-guarded.
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
    Guards against privilege escalation: `caller_email` is the user
    attempting to create/update a policy, or assign one to someone
    (possibly themselves), and `actions` is the full set of actions
    that would end up granted as a result. For every action in
    `actions` that is one of this app's own known-sensitive actions
    (Permission's fixed vocabulary, identity and authorization-
    management actions), confirms the caller is already authorized for
    it, raising HTTP 403 on the first one the caller doesn't already
    hold. Any action outside that vocabulary, an arbitrary business-
    domain action a downstream application built on this template
    defines for its own resources (e.g. "projects:read"), is skipped
    entirely.

    `context` should be the same request-derived context (see
    context/request_context_builder.py's build_authorization_context) the
    route's own require_authorization dependency built for this request.
    Without it, the "do you already hold this action" check below evaluates
    with no IP/time/security_context at all, which fails CLOSED for any
    caller who holds the action only through a context-dependent policy
    (e.g. network- or time-restricted) - denying a grant/assign the caller
    is genuinely entitled to make. Callers that can't supply one (e.g. a
    background task with no real request) still get the old context-less
    behavior by omitting it, which is conservative (may under-grant, never
    over-grants) rather than unsafe.

    Creating a policy, editing a policy's actions, or assigning a
    policy to a user must never be able to hand out (to anyone,
    including the caller themselves) one of *this app's own* sensitive
    actions that the caller doesn't already have, otherwise holding
    only policies:create+policies:assign (without system_superuser
    itself) would let a caller mint an all-powerful policy and assign
    it to themselves.

    Deliberately scoped to Permission's fixed vocabulary rather than
    every action string: PBAC policies in this template are meant to
    freely grant whatever actions a downstream application defines for
    its own business resources; policies:create/assign is a
    general-purpose policy-authoring capability, not itself the
    resource being protected. Only this app's built-in identity/
    authorization actions are sensitive enough to guard here. Called
    from api/pbac_routes/policies/policy_crud_routes.py's create/update
    endpoints and policy_assignment_routes.py's assign endpoint,
    never bypassed by going straight to the repository from a route.

    Imports AuthorizationService locally (not at module level) since
    authorization_service.py imports this module to delegate its own
    assert_authorized_to_grant here - a top-level import would be circular.

    `cache`, when given, is an (action, resource_type) -> allowed dict the
    caller owns and reuses across repeated calls within the same request
    (e.g. a bulk-assign loop calling this once per item). caller_email and
    context are already fixed for the duration of one request, so a given
    (action, resource_type) pair always evaluates to the same answer within
    it - safe to memoize there without a TTL, unlike AuthorizationService's
    own Redis-backed policy cache. Bulk requests routinely repeat the same
    policy (and therefore the same actions/resource_type) across many
    items, so this avoids re-running the full evaluation for each one.
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
