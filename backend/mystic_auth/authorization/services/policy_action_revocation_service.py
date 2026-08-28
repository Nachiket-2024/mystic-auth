from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..caching.authorization_cache_service import authorization_cache_service
from ..models.policy_model import UserPolicy
from ..models.user_permission_model import UserPermission


class ActionNotInPolicyError(ValueError):
    """Raised when the requested action isn't one of the target policy's
    own `actions` - there is nothing to carve out."""


class PolicyActionRevocationService:
    """
    Carves a single action out of a user's policy assignment, without
    touching the policy definition itself (which other users may also
    hold) and without dropping the user's OTHER actions from that same
    policy.

    A Policy assignment is otherwise all-or-nothing (see
    PolicyAssignmentRepository.remove_policy_from_user): revoking it drops
    every action it granted this user, even ones they should keep. The
    only two ways to get "this user loses exactly one action" without this
    service are: revoke the whole policy and manually re-grant the rest as
    direct grants (the same outcome, just done by hand across two dialogs
    and two requests instead of atomically), or edit the policy definition
    itself, which affects every other holder too. Neither is what an admin
    means by "take this one action away from this one user".

    Implementation: within a single transaction, remove the user's
    UserPolicy assignment row for this policy, then re-create (or
    reactivate) a direct UserPermission grant for every one of the
    policy's OTHER actions, carrying over the policy's own `conditions` so
    the user's effective access is unchanged for everything except the
    one revoked action. The user ends up holding the same resource_type/
    conditions as before, just via direct grants instead of the policy,
    for every action except the revoked one.

    Deliberately NOT a database trigger or generic "diff a policy
    assignment" mechanism: this only ever runs at the moment an admin
    explicitly asks to carve out one action, a one-shot conversion from
    policy-derived to direct-derived access for the actions kept.
    """

    @staticmethod
    async def revoke_single_action(
        user_id: int,
        policy,
        action: str,
        db: AsyncSession,
        revoked_by: str | None = None,
        user_email: str | None = None,
    ) -> bool:
        """
        Returns False if the user doesn't hold `policy` at all (caller
        should treat this as 404, mirroring remove_policy_from_user).
        Raises ActionNotInPolicyError if `action` isn't one of the
        policy's own actions (caller should treat this as 400).

        `revoked_by` is the caller's email, recorded as `assigned_by` on
        every direct grant created here - these are genuinely new grants
        the caller is responsible for, same as any other direct grant.
        """
        if action not in policy.actions:
            raise ActionNotInPolicyError(f"'{action}' is not one of policy '{policy.name}'s actions")

        existing_assignment = await db.execute(
            select(UserPolicy).where(UserPolicy.user_id == user_id, UserPolicy.policy_id == policy.id)
        )
        assignment = existing_assignment.scalar_one_or_none()
        if assignment is None:
            return False

        remaining_actions = [a for a in policy.actions if a != action]

        # Only the SAME resource_type as the policy: an existing direct
        # grant for one of these actions on a DIFFERENT resource_type is a
        # separate, unrelated grant that must be left alone.
        existing_grants = await db.execute(
            select(UserPermission).where(
                UserPermission.user_id == user_id,
                UserPermission.resource_type == policy.resource_type,
                UserPermission.action.in_(remaining_actions),
            )
        )
        existing_by_action = {g.action: g for g in existing_grants.scalars().all()}

        for remaining_action in remaining_actions:
            grant = existing_by_action.get(remaining_action)
            if grant is not None:
                grant.conditions = policy.conditions
                grant.is_active = True
                grant.assigned_by = revoked_by
                db.add(grant)
            else:
                db.add(
                    UserPermission(
                        user_id=user_id,
                        action=remaining_action,
                        resource_type=policy.resource_type,
                        conditions=policy.conditions,
                        assigned_by=revoked_by,
                    )
                )

        await db.delete(assignment)
        # One commit for the whole operation: a failure partway through
        # (e.g. the assignment delete) must not leave some of the
        # replacement direct grants committed without it, which would
        # silently duplicate the user's effective access instead of
        # preserving it.
        await db.commit()

        if user_email is not None:
            await authorization_cache_service.invalidate_user_policies(user_email)
            await authorization_cache_service.invalidate_user_permissions(user_email)

        return True


policy_action_revocation_service = PolicyActionRevocationService()
