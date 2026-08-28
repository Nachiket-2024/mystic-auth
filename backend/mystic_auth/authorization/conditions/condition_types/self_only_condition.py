import traceback

from ....logging.logging_config import get_logger
from ..condition_handler import ConditionHandler
from ..resource_field import get_field

logger = get_logger(__name__)


class SelfOnlyCondition(ConditionHandler):
    """
    "self_only": true: the resource's owning identity (its "email") must
    match the acting user's own email. A falsy value (false, missing,
    None) means this condition imposes no restriction. Unsatisfiable
    (denied) if no resource was supplied at all, since an ownership
    condition with nothing to check ownership against cannot be assumed true.

    Also denies if either email is missing/falsy (e.g. the resource
    carries no "email" field), rather than comparing them directly:
    otherwise two falsy values (None == None) would compare equal and
    incorrectly grant "ownership" of a resource that has no owner to a
    caller with no identity.
    """

    def evaluate(self, condition_value, user_email, resource, context) -> bool:
        try:
            if not condition_value:
                return True
            if resource is None:
                return False
            owner_email = get_field(resource, "email")
            if not owner_email or not user_email:
                return False
            return owner_email == user_email
        except Exception:
            logger.warning("self_only condition failed to evaluate, denying:\n%s", traceback.format_exc())
            return False
