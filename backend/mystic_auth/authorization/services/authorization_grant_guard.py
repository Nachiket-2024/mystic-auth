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
    from api/pbac_routes/policy_crud_routes.py's create/update
    endpoints and policy_assignment_routes.py's assign endpoint,
    never bypassed by going straight to the repository from a route.

    Imports AuthorizationService locally (not at module level) since
    authorization_service.py imports this module to delegate its own
    assert_authorized_to_grant here - a top-level import would be circular.
    """
    from .authorization_service import AuthorizationService

    for action in actions:
        if action not in _KNOWN_SENSITIVE_ACTIONS:
            continue
        allowed = await AuthorizationService.authorize(caller_email, action, resource_type, db)
        if not allowed:
            raise AppError(
                status_code=status.HTTP_403_FORBIDDEN,
                code="CANNOT_GRANT_UNHELD_ACTION",
                detail=f"Cannot grant action '{action}': you do not hold it yourself",
                params={"action": action},
            )
