import traceback

# Server clock for a fail-closed batch-item decision's timestamp, never
# anything caller-supplied (see context/request_context_builder.py)
from datetime import UTC, datetime

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import AppError
from ...logging.logging_config import get_logger
from ...procrastinate_tasks.audit_log_tasks import log_authorization_decision_task
from ..evaluators.authorization_decision import AuthorizationDecision
from ..evaluators.policy_evaluator import policy_evaluation_engine
from ..repositories.audit_log_repository import audit_log_repository
from ..repositories.policy_repository import policy_repository
from .authorization_grant_guard import assert_authorized_to_grant

logger = get_logger(__name__)


class AuthorizationService:
    """
    The centralized authorization layer every protected route and business
    service must go through:

        Request -> Authentication -> Authorization Service
                -> Policy Evaluation Engine -> Allow / Deny

    Routes and services never decide authorization themselves; they call
    authorize()/require() here with (user, action, resource, context), and
    this service owns fetching the user's policies and asking the
    evaluation engine for a decision. Nothing above this layer (routes,
    other services) reads roles, permission-role mappings, or does its own
    role/permission comparisons.
    """

    @staticmethod
    async def authorize(
        user_email: str,
        action: str,
        resource_type: str,
        db: AsyncSession,
        resource: dict | object | None = None,
        context: dict | None = None,
    ) -> bool:
        """
        True if `user_email` is authorized for `action` on `resource_type`
        (optionally scoped to a specific `resource`/`context`), False
        otherwise. `user_email` is the acting user's identity, never their
        role; role must never drive an authorization decision here.

        Delegates entirely to authorize_with_decision (computes the
        decision and logs it) and returns just `.allowed`, a thin bool
        wrapper, mirroring PolicyEvaluationEngine.evaluate being a thin
        wrapper over evaluate_detailed. One compute-and-log code path, not
        two: the batch endpoint's authorize_batch reuses this same path
        per check (see below), so a single check and a batch-of-one check
        always produce and log an identical decision.
        """
        decision = await AuthorizationService.authorize_with_decision(
            user_email, action, resource_type, db, resource=resource, context=context
        )
        return decision.allowed

    @staticmethod
    async def authorize_with_decision(
        user_email: str,
        action: str,
        resource_type: str,
        db: AsyncSession,
        resource: dict | object | None = None,
        context: dict | None = None,
    ) -> AuthorizationDecision:
        """
        Same inputs as authorize(), but returns the full
        AuthorizationDecision instead of a bare bool, used wherever a real
        (not hypothetical) authorization decision needs its explanation
        too, e.g. the batch-check endpoint reporting a per-item
        denial_reason. Unlike authorize_detailed (below), this always logs
        an audit entry: it represents a real decision something is about
        to act on, exactly like authorize() does, because authorize() is
        now just `.allowed` off of this same call.

        The decision is computed via authorize_detailed (fetches the user's
        active, assigned policies and asks the evaluation engine), then
        logged here rather than inside authorize_detailed itself, so the
        authorization-check inspection endpoint (which calls
        authorize_detailed directly for a hypothetical "what would happen
        if" query) never pollutes the audit trail with decisions nothing
        actually acted on.
        """
        decision = await AuthorizationService.authorize_detailed(
            user_email, action, resource_type, db, resource=resource, context=context
        )

        await AuthorizationService._log_decision(
            user_email, action, resource_type, resource, context, decision
        )

        return decision

    @staticmethod
    async def authorize_detailed(
        user_email: str,
        action: str,
        resource_type: str,
        db: AsyncSession,
        resource: dict | object | None = None,
        context: dict | None = None,
    ) -> AuthorizationDecision:
        """
        Same inputs as authorize(), but returns the full
        AuthorizationDecision from PolicyEvaluationEngine.evaluate_detailed
        rather than just a bool, used by the authorization-check
        inspection endpoint (api/pbac_routes/authorization_check_routes.py)
        and by _log_decision's audit trail. See evaluators/authorization_decision.py
        for the decision shape.
        """
        policies = await policy_repository.get_active_policies_for_user(user_email, db)

        return policy_evaluation_engine.evaluate_detailed(
            policies=policies,
            action=action,
            resource_type=resource_type,
            user_email=user_email,
            resource=resource,
            context=context,
        )

    @staticmethod
    async def authorize_batch(
        user_email: str,
        checks: list[dict],
        db: AsyncSession,
        context: dict | None = None,
    ) -> list[AuthorizationDecision]:
        """
        Evaluates many `{"action", "resource_type", "resource"}` checks for
        one caller's own effective authorization (there is no per-item
        target user), sharing `context` (the one real request context, see
        context/request_context_builder.py) across every check, since they
        all describe the same single incoming request.

        Fetches the user's active, assigned policies exactly once and
        reuses that list for every check below, avoiding repeated policy
        database queries within one batch request. That's the only
        difference from calling authorize_with_decision N times (which
        would re-fetch on every call); the evaluation logic itself is the
        identical PolicyEvaluationEngine.evaluate_detailed call
        authorize_detailed also makes, so a batch-of-one check always
        agrees with a single authorize() call for the same input. Each
        check's decision is logged individually, same as
        authorize_with_decision, just without re-fetching.

        Fails closed per item: if evaluating one check somehow raises (e.g.
        a corrupt policy row), that item becomes a denied decision with
        denial_reason "evaluation_error" rather than crashing the rest of
        the batch or defaulting to allowed.

        Returns one decision per input check, in the same order; the
        route layer decides how much of each to expose (see
        api/pbac_routes/authorization_check_routes.py, which deliberately surfaces only
        allowed/denial_reason, never matched/rejected/failed_conditions,
        for a batch response).

        Every check's audit entry is written in one bulk insert after the
        whole batch has been evaluated, rather than one commit per check:
        a batch is 1-50 checks (BatchAuthorizationCheckRequest), and
        committing after each one turned this endpoint into up to 50
        sequential DB round trips for what the caller sees as a single
        request. Evaluation itself is unaffected: each decision is still
        computed independently and in order, only the persistence step is
        batched.
        """
        policies = await policy_repository.get_active_policies_for_user(user_email, db)

        decisions: list[AuthorizationDecision] = []
        audit_entries: list[dict] = []
        for check in checks:
            action = check["action"]
            resource_type = check["resource_type"]
            resource = check.get("resource")

            try:
                decision = policy_evaluation_engine.evaluate_detailed(
                    policies=policies,
                    action=action,
                    resource_type=resource_type,
                    user_email=user_email,
                    resource=resource,
                    context=context,
                )
            except Exception:
                logger.warning(
                    "Batch authorization check failed to evaluate (action=%s, resource_type=%s):\n%s",
                    action, resource_type, traceback.format_exc(),
                )
                decision = AuthorizationDecision(
                    allowed=False,
                    action=action,
                    resource_type=resource_type,
                    user=user_email,
                    denial_reason="evaluation_error",
                    evaluation_timestamp=datetime.now(UTC).isoformat(),
                )

            audit_entries.append(
                AuthorizationService._build_audit_entry(
                    user_email, action, resource_type, resource, context, decision
                )
            )
            decisions.append(decision)

        try:
            await audit_log_repository.create_entries(audit_entries, db)
        except Exception:
            # Same "never break the real decision" guarantee as
            # _log_decision: the caller has already gotten every decision
            # above regardless of whether the audit write succeeded.
            logger.warning("Failed to write batch authorization audit log entries:\n%s", traceback.format_exc())

        return decisions

    @staticmethod
    def _build_audit_entry(
        user_email: str,
        action: str,
        resource_type: str,
        resource: dict | object | None,
        context: dict | None,
        decision: AuthorizationDecision,
    ) -> dict:
        """
        The audit log row (as a plain dict, not yet persisted) for one
        decision: `decision` is the full explanation to record, capturing
        not just the bare allow/deny but which policies matched vs. were
        rejected and exactly which condition(s) failed on the rejected
        ones, so "why was this denied" is answerable from the audit trail
        alone, without re-running the evaluation. Shared by _log_decision
        (single, immediate commit) and authorize_batch (many, one commit
        for the whole batch).
        """
        # resource is often an arbitrary dict/object with no guaranteed
        # key, so this is a best-effort identifier for the log entry.
        resource_identifier = None
        if isinstance(resource, dict):
            resource_identifier = resource.get("email") or resource.get("id")
        elif resource is not None:
            resource_identifier = getattr(resource, "email", None) or getattr(resource, "id", None)
        if resource_identifier is not None:
            resource_identifier = str(resource_identifier)

        return {
            "user_email": user_email,
            "action": action,
            "resource_type": resource_type,
            "resource_identifier": resource_identifier,
            "allowed": decision.allowed,
            "candidate_policy_names": decision.matched_policies + decision.rejected_policies,
            "granting_policy_names": decision.matched_policies,
            "failed_conditions": decision.failed_conditions or None,
            "context": context,
        }

    @staticmethod
    async def _log_decision(
        user_email: str,
        action: str,
        resource_type: str,
        resource: dict | object | None,
        context: dict | None,
        decision: AuthorizationDecision,
    ) -> None:
        """
        Queues an audit log row for a single real decision (see
        _build_audit_entry for the row shape) via Procrastinate
        (log_authorization_decision_task), rather than writing it inline:
        this is the choke point every authorize()/require() call goes
        through, so a synchronous DB commit here means every protected
        request pays that write's latency before it can respond. The actual
        INSERT happens in a background worker instead, on its own retry
        schedule; the audit trail becomes eventually consistent (typically
        sub-second) rather than visible the instant this call returns.

        A failure to even *queue* the job (e.g. Procrastinate's own DB
        connection is down) must never break the actual authorization
        decision it's describing, caught and logged as a warning here,
        never re-raised, same guarantee as before this moved to a queue.
        The route/caller that asked for this decision has already gotten
        (or will get) its answer regardless of whether the audit write
        succeeded.
        """
        try:
            await log_authorization_decision_task.defer_async(
                entry=AuthorizationService._build_audit_entry(
                    user_email, action, resource_type, resource, context, decision
                )
            )
        except Exception:
            logger.warning("Failed to queue authorization audit log entry:\n%s", traceback.format_exc())

    @staticmethod
    async def require(
        user_email: str,
        action: str,
        resource_type: str,
        db: AsyncSession,
        resource: dict | object | None = None,
        context: dict | None = None,
    ) -> None:
        """
        Same inputs as authorize(), but raises HTTP 403 instead of
        returning False; the form routes actually call (directly, or via
        dependencies.authorization_dependency.require_authorization).
        """
        allowed = await AuthorizationService.authorize(
            user_email, action, resource_type, db, resource=resource, context=context
        )
        if not allowed:
            raise AppError(
                status_code=status.HTTP_403_FORBIDDEN,
                code="INSUFFICIENT_PERMISSIONS",
                detail="Insufficient permissions",
            )

    # Privilege-escalation guard for granting policies/actions. Kept as a
    # module-level function in authorization_grant_guard.py (this class just
    # re-exports it as a static method, preserving every existing
    # `authorization_service.assert_authorized_to_grant(...)` call site) - see
    # that module's own docstring for why this check exists and what it does.
    assert_authorized_to_grant = staticmethod(assert_authorized_to_grant)


authorization_service = AuthorizationService()
