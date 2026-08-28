import traceback

from ....logging.logging_config import get_logger
from ..condition_handler import ConditionHandler
from ..resource_field import get_field

logger = get_logger(__name__)


class ResourceAttributesCondition(ConditionHandler):
    """
    "resource_attributes": {field: expected_value, ...}: every listed
    field must equal its expected value on the actual resource (e.g.
    {"status": "published"} for a resource-state-scoped grant). An empty/
    missing map imposes no restriction. Unsatisfiable if no resource was
    supplied.

    Fails safe (denies) if condition_value isn't a mapping (e.g. it
    reached evaluation some way other than the validated management API,
    per condition_validator.py's defense-in-depth note).
    """

    def evaluate(self, condition_value, user_email, resource, context) -> bool:
        try:
            if not condition_value:
                return True
            if resource is None:
                return False
            return all(
                get_field(resource, field) == expected_value for field, expected_value in condition_value.items()
            )
        except Exception:
            logger.warning("resource_attributes condition failed to evaluate, denying:\n%s", traceback.format_exc())
            return False
