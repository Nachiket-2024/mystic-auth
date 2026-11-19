from unittest.mock import AsyncMock

import pytest


@pytest.fixture(autouse=True)
def no_system_superuser_grants_by_default(mocker):
    """Keep unrelated unit tests isolated from the database-backed grant lookup."""
    mocker.patch(
        "backend.mystic_auth.authorization.services.authorization_grant_guard"
        ".policy_assignment_repository.get_active_policies_for_user",
        new_callable=AsyncMock,
        return_value=[],
    )
