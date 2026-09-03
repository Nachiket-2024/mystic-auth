import traceback

from ...authorization.policies.default_policies import SELF_SERVICE_POLICY_NAME

# PBAC: new users get their access via an explicit default policy assignment,
# never via their (metadata-only) role: see the role-as-metadata invariant.
from ...authorization.repositories.policy_repository import policy_repository
from ...logging.logging_config import get_logger
from ...user.user_crud_collector import user_crud

# Default role assigned to all new users, metadata only (display/grouping); it
# grants no access. See the PBAC policy assignment below for what actually
# authorizes a new account.
from ...user.user_model import UserRole
from ..password_logic.password_service import password_service

logger = get_logger(__name__)


class SignupService:
    """Hashes the password, checks for duplicates, and creates the user with default access."""

    @staticmethod
    # `db` is deliberately unannotated: real callers pass an AsyncSession,
    # but unit tests call this with db=None while mocking the db-touching
    # collaborators, so neither `AsyncSession` nor `AsyncSession | None`
    # fits both cases cleanly.
    async def signup(name: str, email: str, password: str, db) -> bool:
        try:
            existing_user = await user_crud.get_by_email(email, db)

            # Hashed unconditionally so both branches take the same Argon2
            # time; skipping it on the existing-email path would let an
            # attacker distinguish emails by response latency alone.
            hashed_password = await password_service.hash_password(password)

            if existing_user:
                logger.info("Signup attempt with existing email: %s", email)
                return False

            user_data = {
                "name": name,
                "email": email,
                "hashed_password": hashed_password,
                "role": UserRole.user,      # Metadata/display only, grants nothing
                "is_verified": False,
                "is_active": True,
            }

            new_user = await user_crud.create(user_data, db)

            # Assign the baseline self-service policy: the actual source of
            # this account's access, per PBAC.
            self_service_policy = await policy_repository.get_by_name(SELF_SERVICE_POLICY_NAME, db)
            if self_service_policy:
                await policy_repository.assign_policy_to_user(
                    user_id=new_user.id, policy_id=self_service_policy.id, db=db, assigned_by="system"
                )
            else:
                # Should never happen once the seeding migration has run.
                # logged loudly rather than failing signup outright, since a
                # missing baseline policy is an operational/migration issue, not
                # something this particular signup request caused.
                logger.error(
                    "Default policy '%s' not found, new user %s created with no assigned policies",
                    SELF_SERVICE_POLICY_NAME, email,
                )

            return True

        except Exception:
            logger.error("Error during signup:\n%s", traceback.format_exc())
            return False


signup_service = SignupService()
