from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

# The one centralized Redis abstraction for authorization data, see its own
# docstring for exactly what is (and deliberately isn't) cached, and why.
# Every mutation below invalidates whatever it could have made stale.
from ..caching.authorization_cache_service import authorization_cache_service
from ..models.policy_model import Policy

# Every create/update/delete below also stages a policy_history row in the
# same transaction, policy versioning writes history rows in the same transaction:
# every policy mutation must be traceable and reversible.
from .policy_assignment_repository import policy_assignment_repository
from .policy_history_repository import policy_history_repository


def _definition_snapshot(policy: Policy) -> dict:
    """
    The versioned "definition" of a policy: everything that determines
    what it grants, for policy_history's previous_definition/
    new_definition columns. Deliberately excludes id/timestamps: those
    identify *which row*, not *what it currently grants*, and would make
    every history diff spuriously include updated_at.
    """
    return {
        "name": policy.name,
        "description": policy.description,
        "actions": list(policy.actions) if policy.actions else [],
        "resource_type": policy.resource_type,
        "conditions": policy.conditions,
        "is_active": policy.is_active,
    }


class PolicyRepository:
    """
    Persistence layer for policies and user<->policy assignments. This is
    the only place that issues queries against the policies/user_policies
    tables: evaluators and services call through here rather than building
    their own queries, so the schema/query shape only needs to change in
    one place.

    Policies are looked up by name throughout the app (routes take a
    human-readable policy_name, never a numeric id), so there is no
    get_by_id; add one if/when a caller actually needs id-based lookup.

    create/update/delete each stage a policy_history row (via
    policy_history_repository.add_entry) alongside their own mutation and
    commit both in the same transaction, so a history entry can never
    exist without the change it describes actually having been persisted,
    or vice versa.
    """

    @staticmethod
    async def create(data: dict, db: AsyncSession, changed_by: str | None = None) -> Policy:
        policy = Policy(**data)
        db.add(policy)
        await db.flush()  # assign policy.id without ending the transaction

        policy_history_repository.add_entry(
            {
                "policy_id": policy.id,
                "policy_name": policy.name,
                "change_type": "created",
                "previous_definition": None,
                "new_definition": _definition_snapshot(policy),
                "changed_fields": None,
                "changed_by": changed_by,
                "change_reason": None,
            },
            db,
        )

        await db.commit()
        await db.refresh(policy)
        return policy

    @staticmethod
    async def get_by_name(name: str, db: AsyncSession) -> Policy | None:
        result = await db.execute(select(Policy).where(Policy.name == name))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_all(db: AsyncSession, limit: int = 1000, offset: int = 0) -> list[Policy]:
        # Capped: every other list endpoint in the app (audit log, policy
        # history) bounds its query the same way; this one previously read
        # the whole table unconditionally.
        stmt = select(Policy).order_by(Policy.id).limit(limit).offset(offset)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def update(
        db_obj: Policy,
        update_data: dict,
        db: AsyncSession,
        changed_by: str | None = None,
        change_reason: str | None = None,
        change_type: str = "updated",
    ) -> Policy:
        """
        `change_type` is "updated" for a normal edit, or "rolled_back" when
        this call is restoring a prior version (see
        api/pbac_routes/policy_history_routes.py's rollback endpoint); the
        only difference is how the resulting
        history entry is labeled; the mutation logic is identical either
        way, so rollback reuses this method rather than duplicating it.
        """
        previous_definition = _definition_snapshot(db_obj)

        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.flush()

        new_definition = _definition_snapshot(db_obj)
        changed_fields = [
            field for field in update_data
            if previous_definition.get(field) != new_definition.get(field)
        ]

        # A no-op update (nothing actually differs) still gets a history
        # entry: the caller explicitly asked for this change, and an
        # empty changed_fields list is itself meaningful information
        # (e.g. rolling back to a version identical to the current one).
        policy_history_repository.add_entry(
            {
                "policy_id": db_obj.id,
                "policy_name": db_obj.name,
                "change_type": change_type,
                "previous_definition": previous_definition,
                "new_definition": new_definition,
                "changed_fields": changed_fields,
                "changed_by": changed_by,
                "change_reason": change_reason,
            },
            db,
        )

        await db.commit()
        await db.refresh(db_obj)

        # This policy's definition changed: every user who holds it may
        # now have a stale cached effective-policy set (see
        # AuthorizationCacheService.invalidate_all_user_policies's own
        # docstring for why this is a full-namespace flush rather than a
        # targeted one).
        await authorization_cache_service.invalidate_all_user_policies()

        return db_obj

    @staticmethod
    async def delete(
        db_obj: Policy,
        db: AsyncSession,
        changed_by: str | None = None,
        change_reason: str | None = None,
    ) -> None:
        previous_definition = _definition_snapshot(db_obj)

        policy_history_repository.add_entry(
            {
                "policy_id": db_obj.id,
                "policy_name": db_obj.name,
                "change_type": "deleted",
                "previous_definition": previous_definition,
                "new_definition": None,
                "changed_fields": None,
                "changed_by": changed_by,
                "change_reason": change_reason,
            },
            db,
        )

        await db.delete(db_obj)
        await db.commit()

        # See update()'s own comment: deleting a policy can strand every
        # holder's cached effective-policy set just as editing one can.
        await authorization_cache_service.invalidate_all_user_policies()

    # User<->policy assignment queries/mutations live in
    # policy_assignment_repository.py, re-exported here as bound methods so
    # every existing `policy_repository.assign_policy_to_user(...)`-style
    # call site keeps working unchanged.
    # These are @staticmethod on PolicyAssignmentRepository, so
    # policy_assignment_repository.X is a plain function, not a bound
    # method - re-wrapped in staticmethod(...) here too, otherwise assigning
    # a plain function as a class attribute makes normal instance-method
    # binding kick in on access via `policy_repository.X(...)`, silently
    # injecting the PolicyRepository instance as an extra first argument.
    get_active_policies_for_user = staticmethod(policy_assignment_repository.get_active_policies_for_user)
    get_policies_for_user = staticmethod(policy_assignment_repository.get_policies_for_user)
    count_assignments = staticmethod(policy_assignment_repository.count_assignments)
    assign_policy_to_user = staticmethod(policy_assignment_repository.assign_policy_to_user)
    remove_policy_from_user = staticmethod(policy_assignment_repository.remove_policy_from_user)


policy_repository = PolicyRepository()
