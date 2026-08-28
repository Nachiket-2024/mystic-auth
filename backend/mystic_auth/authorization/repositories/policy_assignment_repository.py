from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ...user.user_model import User

# The one centralized Redis abstraction for authorization data, see its own
# docstring for exactly what is (and deliberately isn't) cached, and why.
# Every mutation below invalidates whatever it could have made stale.
from ..caching.authorization_cache_service import authorization_cache_service
from ..models.policy_model import Policy, UserPolicy
from ..schemas.bulk_schema import BulkItemResult


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
        api/pbac_routes/policies/policy_assignment_routes.py's revoke endpoint to refuse removing the
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
    async def get_holder_emails_for_update(policy_id: int, db: AsyncSession) -> list[str]:
        """
        Locking counterpart to get_holder_emails: takes a row lock on every
        current UserPolicy assignment of this policy before returning
        their holders' emails.

        Used by bulk_remove_policies' route-level "can't remove the last
        system_superuser assignment" lockout guard: without a lock, two
        concurrent bulk-remove requests each targeting a different subset
        of superuser holders could both read the same pre-either-removal
        holder count, each independently conclude its own subset leaves
        someone behind, and both commit - together stripping every
        system_superuser assignment (a full admin lockout) despite the
        guard each individually passed. Locking these rows up front
        serializes any two such requests touching the same policy: the
        second blocks until the first commits its removals, then this
        call re-reads the real post-removal holder set.
        """
        result = await db.execute(
            select(User.email)
            .join(UserPolicy, UserPolicy.user_id == User.id)
            .where(UserPolicy.policy_id == policy_id)
            .with_for_update(of=UserPolicy)
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
        (api/pbac_routes/policies/policy_assignment_routes.py) does pass it, since that target user may
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
    async def user_holds_policy(user_id: int, policy_id: int, db: AsyncSession) -> bool:
        """
        Whether this user currently holds this policy assignment, regardless
        of the policy's own is_active flag. Used by the revoke routes
        (api/pbac_routes/policies/policy_assignment_routes.py) to check holdership
        BEFORE the system_superuser last-holder lockout check runs, so a
        caller revoking from a user who never held the policy gets the
        correct 404 POLICY_NOT_HELD_BY_USER instead of being incorrectly
        blocked by the lockout guard.
        """
        result = await db.execute(
            select(UserPolicy).where(
                UserPolicy.user_id == user_id, UserPolicy.policy_id == policy_id
            )
        )
        return result.scalar_one_or_none() is not None

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


    @staticmethod
    async def bulk_assign_policies(
        valid_items: list[tuple[User, Policy]], db: AsyncSession, assigned_by: str | None
    ) -> list[BulkItemResult]:
        """
        `valid_items` is every (User, Policy) pair that already passed
        resolution and the per-item privilege-escalation guard in the route
        layer (bulk_policy_routes.py) - this method only stages writes and
        commits once for the whole batch (see this module's own bulk
        semantics: best-effort per item, all-or-nothing only for a genuine
        DB-level commit failure, mirrored below).

        Idempotent per item, same as assign_policy_to_user: an already-held
        pair adds no duplicate row and is reported "already_held" rather
        than "success".

        The existing_pairs snapshot below only rules out pairs already held
        *before* this call started - it can't see another request's insert
        of the same (user, policy) pair racing this one, so a plain insert
        can still hit the uq_user_policy unique constraint. Each insert is
        therefore staged inside its own SAVEPOINT (db.begin_nested) and
        flushed individually: a unique-violation there is caught and
        resolved to "already_held" (the pair is genuinely held either way,
        by whichever request won) without discarding the rest of the
        batch's SAVEPOINTs, unlike letting it surface at the final
        db.commit() - which would fail the whole transaction and previously
        got reported as "commit_failed" across every item, including
        unrelated ones that never conflicted with anything.
        """
        if not valid_items:
            return []

        user_ids = {user.id for user, _ in valid_items}
        policy_ids = {policy.id for _, policy in valid_items}
        existing = await db.execute(
            select(UserPolicy.user_id, UserPolicy.policy_id).where(
                UserPolicy.user_id.in_(user_ids), UserPolicy.policy_id.in_(policy_ids)
            )
        )
        existing_pairs = {(uid, pid) for uid, pid in existing.all()}

        results: list[BulkItemResult] = []
        affected_emails: set[str] = set()
        for user, policy in valid_items:
            affected_emails.add(user.email)
            already_held = (user.id, policy.id) in existing_pairs
            if already_held:
                results.append(BulkItemResult(user_email=user.email, identifier=policy.name, status="already_held"))
                continue

            try:
                async with db.begin_nested():
                    db.add(UserPolicy(user_id=user.id, policy_id=policy.id, assigned_by=assigned_by))
                    await db.flush()
            except IntegrityError:
                results.append(BulkItemResult(user_email=user.email, identifier=policy.name, status="already_held"))
                continue

            results.append(BulkItemResult(user_email=user.email, identifier=policy.name, status="success"))

        try:
            await db.commit()
        except Exception:
            await db.rollback()
            return [
                BulkItemResult(user_email=r.user_email, identifier=r.identifier, status="error", error="commit_failed")
                for r in results
            ]

        await authorization_cache_service.invalidate_user_policies_bulk(affected_emails)

        return results

    @staticmethod
    async def bulk_remove_policies(
        valid_items: list[tuple[User, Policy]], db: AsyncSession
    ) -> list[BulkItemResult]:
        """Removal counterpart to bulk_assign_policies. An item whose pair
        isn't actually held is reported as an error (`not_held`), same as
        the single-item route's 404, rather than silently skipped."""
        if not valid_items:
            return []

        user_ids = {user.id for user, _ in valid_items}
        policy_ids = {policy.id for _, policy in valid_items}
        existing = await db.execute(
            select(UserPolicy).where(UserPolicy.user_id.in_(user_ids), UserPolicy.policy_id.in_(policy_ids))
        )
        existing_rows = {(row.user_id, row.policy_id): row for row in existing.scalars().all()}

        results: list[BulkItemResult] = []
        affected_emails: set[str] = set()
        for user, policy in valid_items:
            row = existing_rows.get((user.id, policy.id))
            if row is None:
                results.append(
                    BulkItemResult(user_email=user.email, identifier=policy.name, status="error", error="not_held")
                )
                continue
            await db.delete(row)
            affected_emails.add(user.email)
            results.append(BulkItemResult(user_email=user.email, identifier=policy.name, status="success"))

        try:
            await db.commit()
        except Exception:
            await db.rollback()
            return [
                BulkItemResult(
                    user_email=r.user_email, identifier=r.identifier, status="error", error="commit_failed"
                )
                if r.status == "success"
                else r
                for r in results
            ]

        await authorization_cache_service.invalidate_user_policies_bulk(affected_emails)

        return results


policy_assignment_repository = PolicyAssignmentRepository()
