from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ...database.base import Base


class UserPermission(Base):
    """
    A direct grant of a single action to a single user, bypassing Policy
    entirely. This is the genuinely granular counterpart to UserPolicy
    (authorization/models/policy_model.py): a Policy is a named, reusable
    bundle of actions meant for the common case ("give this user the
    self_service set"); a UserPermission is an unnamed, ad hoc
    (user, action, resource_type, conditions) tuple for the case where even
    the narrowest existing policy still grants more than intended, and
    defining a new one-off named policy per such case would just recreate
    RBAC-by-another-name.

    Reuses the exact same `conditions` shape/semantics as Policy.conditions
    (see policy_evaluator.py) rather than a second, weaker scoping
    mechanism: at evaluation time, PolicyEvaluationEngine.evaluate_detailed
    never sees UserPermission rows directly, it sees them normalized into
    transient Policy-shaped objects (see AuthorizationService._get_effective_policies),
    so both flow through identical action/resource_type/condition matching.

    No name/description: unlike a Policy, this isn't a shareable,
    independently-editable object other users can also hold; it only ever
    describes this one user's one grant.
    """

    __tablename__ = "user_permissions"
    __table_args__ = (
        # A user cannot hold the exact same (action, resource_type) grant twice.
        UniqueConstraint("user_id", "action", "resource_type", name="uq_user_permission"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # A single action identifier (e.g. "users:read_own"), the same
    # vocabulary as Policy.actions' entries (authorization/permissions.py).
    action: Mapped[str]

    # Resource type this grant applies to (e.g. "users", or "*"), same
    # semantics as Policy.resource_type.
    resource_type: Mapped[str]

    # Optional conditions narrowing the grant, same shape as
    # Policy.conditions. Null means an unconditional grant.
    conditions: Mapped[dict | None] = mapped_column(JSONB)

    # Mirrors Policy.is_active: lets a grant be disabled without losing its
    # audit trail. Unlike Policy, there is no separate "definition" row to
    # toggle independently of the assignment, so this flag lives on the
    # grant itself.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Email of the user who made this grant, or "system", for the audit trail.
    assigned_by: Mapped[str | None] = mapped_column(String)
