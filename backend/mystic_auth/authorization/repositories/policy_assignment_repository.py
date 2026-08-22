from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ...user_table.user_model import User

# The one centralized Redis abstraction for authorization data, see its own
# docstring for exactly what is (and deliberately isn't) cached, and why.
# Every mutation below invalidates whatever it could have made stale.
from ..caching.authorization_cache_service import authorization_cache_service
from ..models.policy_model import Policy, UserPolicy


class PolicyAssignmentRepository:
    """
    User<->policy assignment queries and mutations: which policies a user
    holds, and granting/revoking one. Split out of policy_repository.py,
    which owns policy CRUD itself (create/update/delete a Policy row) but
    re-exports every method here as a bound method, so every existing
    `policy_repository.assign_policy_to_user(...)`-style call site keeps
    working unchanged.
    """

    @staticmethod
    async def get_active_policies_for_user(user_email: str, db: AsyncSession) -> list[Policy]:
        """
        The query the authorization/evaluation path actually runs: every
        *active* policy assigned to the user with this email. Filtering
        is_active here (rather than in the evaluator) keeps a disabled
        policy from ever reaching evaluation at all.

        Cache-aside: this is the one authorization-hot-path query cached
        by AuthorizationCacheService (see its docstring for exactly what's
        cached and why); checked first; on a miss (or any cache failure),
        falls through to the database and populates the cache for next
        time. A cache read failure is indistinguishable from a miss here
        by design (see AuthorizationCacheService's "fail closed" note).
        """
        cached = await authorization_cache_service.get_user_policies(user_email)
        if cached is not None:
            return cached

        stmt = (
            select(Policy)
            .join(UserPolicy, UserPolicy.policy_id == Policy.id)
            .join(User, User.id == UserPolicy.user_id)
            .where(User.email == user_email, Policy.is_active.is_(True))
        )
        result = await db.execute(stmt)
        policies = list(result.scalars().all())

        await authorization_cache_service.set_user_policies(user_email, policies)
        return policies

    @staticmethod
    async def get_policies_for_user(user_email: str, db: AsyncSession) -> list[Policy]:
        """Every assigned policy (active or not): for inspection/listing,
        not for making an authorization decision (use
        get_active_policies_for_user for that)."""
        stmt = (
            select(Policy)
            .join(UserPolicy, UserPolicy.policy_id == Policy.id)
            .join(User, User.id == UserPolicy.user_id)
            .where(User.email == user_email)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def count_assignments(policy_id: int, db: AsyncSession) -> int:
        """
        How many users currently hold this policy (assigned, regardless of
        the policy's own is_active flag). Used by
        api/pbac_routes/policy_assignment_routes.py's revoke endpoint to refuse removing the
        last remaining holder of system_superuser, see the
        "System policies are protected": deleting a policy row is already
        blocked for baseline policies, but *revoking every assignment* of
        system_superuser would leave the system equally unrecoverable
        (no one left able to manage policies at all).
        """
        result = await db.execute(
            select(func.count()).select_from(UserPolicy).where(UserPolicy.policy_id == policy_id)
        )
        return result.scalar_one()

    @staticmethod
    async def get_holder_emails(policy_id: int, db: AsyncSession) -> list[str]:
        """
        Every email currently assigned this policy (regardless of the
        policy's own is_active flag - a holder of a just-deactivated policy
        still needs to be told its access dropped). Used by
        policy_crud_routes.py's update_policy/delete_policy to know who to
        push a permissions_changed event to when a policy's *definition*
        changes rather than one user's assignment of it (see
        session_events.publish_permissions_changed): unlike
        assign/remove_policy_from_user, those two affect every holder at
        once, not a single already-known user_email.
        """
        result = await db.execute(
            select(User.email).join(UserPolicy, UserPolicy.user_id == User.id).where(UserPolicy.policy_id == policy_id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def assign_policy_to_user(
        user_id: int,
        policy_id: int,
        db: AsyncSession,
        assigned_by: str | None = None,
        user_email: str | None = None,
    ) -> UserPolicy:
        """
        `assigned_by` is the email of the user making the assignment, or
        "system" for automated assignment (e.g. default policy at signup),
        for the audit trail.

        `user_email` is the receiving user's email, if the caller has it:
        used only to precisely invalidate that user's cached effective-
        policy set (see AuthorizationCacheService). Optional and backward
        compatible: system-side self-assignment at signup/OAuth2/system-
        user-bootstrap doesn't pass it, since a brand-new user has nothing
        cached yet to invalidate anyway; the management-facing assign route
        (api/pbac_routes/policy_assignment_routes.py) does pass it, since that target user may
        already have a populated cache entry.

        Idempotent: assigning an already-held policy is a no-op, returning
        the existing assignment rather than raising a duplicate-key error.
        """
        existing = await db.execute(
            select(UserPolicy).where(
                UserPolicy.user_id == user_id, UserPolicy.policy_id == policy_id
            )
        )
        existing_row = existing.scalar_one_or_none()
        if existing_row:
            return existing_row

        assignment = UserPolicy(user_id=user_id, policy_id=policy_id, assigned_by=assigned_by)
        db.add(assignment)
        await db.commit()
        await db.refresh(assignment)

        if user_email is not None:
            await authorization_cache_service.invalidate_user_policies(user_email)

        return assignment

    @staticmethod
    async def remove_policy_from_user(
        user_id: int, policy_id: int, db: AsyncSession, user_email: str | None = None
    ) -> bool:
        """
        `user_email` is optional, used only for precise cache invalidation
        see assign_policy_to_user's own docstring. Returns True if an
        assignment was found and removed, False if the user didn't hold
        this policy to begin with.
        """
        result = await db.execute(
            select(UserPolicy).where(
                UserPolicy.user_id == user_id, UserPolicy.policy_id == policy_id
            )
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            return False

        await db.delete(assignment)
        await db.commit()

        if user_email is not None:
            await authorization_cache_service.invalidate_user_policies(user_email)

        return True


policy_assignment_repository = PolicyAssignmentRepository()
