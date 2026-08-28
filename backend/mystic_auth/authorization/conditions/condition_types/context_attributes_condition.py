import traceback

from ....logging.logging_config import get_logger
from ..condition_handler import ConditionHandler

logger = get_logger(__name__)


class ContextAttributesCondition(ConditionHandler):
    """
    "context_attributes": {key: expected_value, ...}: every listed key
    must match its expected value in the caller-supplied context (e.g.
    {"mfa_verified": True} for an MFA-gated action). An empty/missing map
    imposes no restriction. Unsatisfiable if no context was supplied.

    Fails safe (denies) if condition_value isn't a mapping (e.g. it
    reached evaluation some way other than the validated management API,
    per condition_validator.py's defense-in-depth note).
    """

    def evaluate(self, condition_value, user_email, resource, context) -> bool:
        try:
            if not condition_value:
                return True
            if context is None:
                return False
            return all(context.get(key) == expected_value for key, expected_value in condition_value.items())
        except Exception:
            logger.warning("context_attributes condition failed to evaluate, denying:\n%s", traceback.format_exc())
            return False
