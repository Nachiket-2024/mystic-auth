# tests/backend/mystic_auth/unit/authorization/services/conftest.py
#
# AuthorizationService._get_effective_policies fetches BOTH the user's
# assigned policies (policy_repository.get_active_policies_for_user, mocked
# per-test throughout this directory) AND their direct permission grants
# (user_permission_repository.get_active_permissions_for_user, see
# authorization/models/user_permission_model.py). Every existing test here
# only cares about the policy-fetching side, so this autouse fixture stubs
# the direct-grants fetch to "the user holds none" by default - tests that
# specifically want to exercise direct grants (see
# test_authorization_service_direct_grants_unit.py) override this mock
# explicitly instead of relying on the default.
from unittest.mock import AsyncMock

import pytest

MODULE = "backend.mystic_auth.authorization.services.authorization_service"


@pytest.fixture(autouse=True)
def _no_direct_permission_grants_by_default(mocker):
    mocker.patch(f"{MODULE}.user_permission_repository.get_active_permissions_for_user", new_callable=AsyncMock, return_value=[])
