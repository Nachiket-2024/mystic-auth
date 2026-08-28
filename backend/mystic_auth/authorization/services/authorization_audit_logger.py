import traceback

from ...logging.logging_config import get_logger
from ...procrastinate_tasks.audit_log_tasks import log_authorization_decision_task
from ..evaluators.authorization_decision import AuthorizationDecision

logger = get_logger(__name__)


def build_audit_entry(
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
    alone, without re-running the evaluation. Shared by log_decision
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


async def log_decision(
    user_email: str,
    action: str,
    resource_type: str,
    resource: dict | object | None,
    context: dict | None,
    decision: AuthorizationDecision,
) -> None:
    """
    Queues an audit log row for a single real decision (see
    build_audit_entry for the row shape) via Procrastinate
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
            entry=build_audit_entry(user_email, action, resource_type, resource, context, decision)
        )
    except Exception:
        logger.warning("Failed to queue authorization audit log entry:\n%s", traceback.format_exc())
