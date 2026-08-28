from fastapi import status
from sqlalchemy.exc import InvalidRequestError
from sqlalchemy.ext.asyncio import AsyncSession

# The one centralized Redis abstraction for authorization data, see its own
# docstring for exactly what is (and deliberately isn't) cached, and why.
# Every mutation below invalidates whatever it could have made stale.
from ...core.errors import AppError
from ..caching.authorization_cache_service import authorization_cache_service
from ..models.policy_model import Policy

# Every create/update/delete below also stages a policy_history row in the
# same transaction, policy versioning writes history rows in the same transaction:
# every policy mutation must be traceable and reversible.
from .policy_assignment_repository import policy_assignment_repository
from .policy_history_repository import policy_history_repository
from .policy_query_repository import policy_query_repository


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
        api/pbac_routes/policies/policy_history_routes.py's rollback endpoint); the
        only difference is how the resulting
        history entry is labeled; the mutation logic is identical either
        way, so rollback reuses this method rather than duplicating it.

        `db_obj` was read by the caller (e.g. get_by_name) before this
        transaction held any lock on the row, so two concurrent updates to
        the same policy could otherwise both start from the same stale
        snapshot: each would compute previous_definition from
        pre-either-update state, and the second commit would silently
        overwrite whichever fields the first update changed but this one
        didn't touch, corrupting policy_history's previous_definition/
        new_definition chain and dropping the first admin's change with no
        conflict surfaced to either caller. Re-fetching with FOR UPDATE
        here serializes concurrent updates to the same policy (the second
        transaction blocks until the first commits, then observes its
        result) and populate_existing refreshes this already-identity-
        mapped instance's attributes from that fresh row rather than
        trusting the stale in-memory values.
        """
        locked_obj = await db.get(Policy, db_obj.id, populate_existing=True, with_for_update=True)
        if locked_obj is None:
            # A concurrent request deleted this exact policy while this
            # request was blocked waiting for the row lock: there is
            # nothing left to update. Surfacing a clear 404 here (rather
            # than letting _definition_snapshot below raise AttributeError
            # on None) keeps this an ordinary, explainable HTTP error
            # instead of an unhandled-exception 500.
            raise AppError(
                status_code=status.HTTP_404_NOT_FOUND,
                code="POLICY_NOT_FOUND",
                detail=f"Policy '{db_obj.name}' was deleted by another request",
                params={"policyName": db_obj.name},
            )
        db_obj = locked_obj
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
        try:
            await db.refresh(db_obj)
        except InvalidRequestError:
            # A concurrent request deleted this policy right after this
            # update's own commit (already successful, recorded in
            # policy_history above). No row is left to refresh from, so
            # report "not found" to reflect the policy's actual state now.
            policy_name = new_definition["name"]
            raise AppError(
                status_code=status.HTTP_404_NOT_FOUND,
                code="POLICY_NOT_FOUND",
                detail=f"Policy '{policy_name}' was deleted by another request immediately after this update",
                params={"policyName": policy_name},
            ) from None

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

    # Re-exports of policy_query_repository.py's and
    # policy_assignment_repository.py's functions so existing
    # `policy_repository.get_all(...)`-style calls keep working. Re-wrapped
    # in staticmethod(...) or assigning them as a plain class attribute
    # would trigger normal instance-method binding, silently injecting the
    # PolicyRepository instance as an extra first argument.
    get_by_name = staticmethod(policy_query_repository.get_by_name)
    get_policies_by_names = staticmethod(policy_query_repository.get_policies_by_names)
    get_all = staticmethod(policy_query_repository.get_all)
    get_all_as_read_schemas = staticmethod(policy_query_repository.get_all_as_read_schemas)
    count = staticmethod(policy_query_repository.count)

    get_active_policies_for_user = staticmethod(policy_assignment_repository.get_active_policies_for_user)
    get_policies_for_user = staticmethod(policy_assignment_repository.get_policies_for_user)
    get_holder_emails = staticmethod(policy_assignment_repository.get_holder_emails)
    get_holder_emails_for_update = staticmethod(policy_assignment_repository.get_holder_emails_for_update)
    count_assignments = staticmethod(policy_assignment_repository.count_assignments)
    user_holds_policy = staticmethod(policy_assignment_repository.user_holds_policy)
    assign_policy_to_user = staticmethod(policy_assignment_repository.assign_policy_to_user)
    remove_policy_from_user = staticmethod(policy_assignment_repository.remove_policy_from_user)
    bulk_assign_policies = staticmethod(policy_assignment_repository.bulk_assign_policies)
    bulk_remove_policies = staticmethod(policy_assignment_repository.bulk_remove_policies)


policy_repository = PolicyRepository()
