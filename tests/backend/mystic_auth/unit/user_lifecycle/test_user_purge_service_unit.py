# tests/backend/mystic_auth/unit/user_lifecycle/test_user_purge_service_unit.py
#
# Mocked-collaborator coverage for purge_user_account's own wiring (revoke
# -> audit -> delete -> cache-invalidate sequence, and what it's called
# with), same split as test_account_purge_tasks_unit.py vs. the real-DB
# integration coverage. Specifically covers the authorization-cache
# invalidation this function used to skip entirely: without it, a fresh
# signup reusing a just-purged account's email within the cache's TTL
# window could transiently inherit that purged user's stale cached
# policies/permissions on its very first authorization check.
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.mystic_auth.user_lifecycle.user_purge_service import purge_user_account

MODULE = "backend.mystic_auth.user_lifecycle.user_purge_service"


class _FakeUser:
    def __init__(self, email: str):
        self.email = email


@pytest.fixture(autouse=True)
def _mock_collaborators(mocker):
    mocker.patch(f"{MODULE}.refresh_token_service.revoke_all_tokens_for_user", new_callable=AsyncMock, return_value=2)
    mocker.patch(f"{MODULE}.log_security_event", new_callable=AsyncMock)
    mocker.patch(f"{MODULE}.user_crud.delete", new_callable=AsyncMock)


@pytest.mark.asyncio
async def test_purge_invalidates_both_authorization_cache_entries_for_the_purged_users_email(mocker):
    invalidate_policies_mock = mocker.patch(
        f"{MODULE}.authorization_cache_service.invalidate_user_policies", new_callable=AsyncMock
    )
    invalidate_permissions_mock = mocker.patch(
        f"{MODULE}.authorization_cache_service.invalidate_user_permissions", new_callable=AsyncMock
    )
    user = _FakeUser("purge-me@example.com")

    await purge_user_account(user, db=MagicMock(), purged_by="admin@example.com")

    invalidate_policies_mock.assert_awaited_once_with("purge-me@example.com")
    invalidate_permissions_mock.assert_awaited_once_with("purge-me@example.com")


@pytest.mark.asyncio
async def test_purge_invalidates_the_cache_after_the_row_is_actually_deleted(mocker):
    """Ordering matters for the same reason the audit log is written before
    delete() here: the invalidation only needs to happen once the row (and
    the email it frees up) is actually gone, not before."""
    call_order = []
    mocker.patch(
        f"{MODULE}.user_crud.delete",
        new_callable=AsyncMock,
        side_effect=lambda **kwargs: call_order.append("delete"),
    )
    mocker.patch(
        f"{MODULE}.authorization_cache_service.invalidate_user_policies",
        new_callable=AsyncMock,
        side_effect=lambda *args: call_order.append("invalidate_policies"),
    )
    mocker.patch(
        f"{MODULE}.authorization_cache_service.invalidate_user_permissions",
        new_callable=AsyncMock,
        side_effect=lambda *args: call_order.append("invalidate_permissions"),
    )
    user = _FakeUser("order-check@example.com")

    await purge_user_account(user, db=MagicMock(), purged_by="admin@example.com")

    assert call_order == ["delete", "invalidate_policies", "invalidate_permissions"]


@pytest.mark.asyncio
async def test_purge_returns_the_revoked_session_count_unchanged(mocker):
    """The cache-invalidation addition must not alter this function's
    existing return contract (account_purge_tasks.py's own caller doesn't
    use it, but the admin purge route reports it in its response)."""
    mocker.patch(f"{MODULE}.authorization_cache_service.invalidate_user_policies", new_callable=AsyncMock)
    mocker.patch(f"{MODULE}.authorization_cache_service.invalidate_user_permissions", new_callable=AsyncMock)
    user = _FakeUser("count-check@example.com")

    result = await purge_user_account(user, db=MagicMock(), purged_by="admin@example.com")

    assert result == 2
