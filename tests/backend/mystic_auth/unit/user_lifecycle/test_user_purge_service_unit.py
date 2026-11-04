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
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.mystic_auth.user_lifecycle.user_purge_service import (
    AccountNoLongerEligibleForPurgeError,
    purge_user_account,
)

MODULE = "backend.mystic_auth.user_lifecycle.user_purge_service"

_DELETED_AT = datetime.now(UTC)


class _FakeUser:
    def __init__(self, email: str, id: int = 1, deleted_at=_DELETED_AT):
        self.id = id
        self.email = email
        self.deleted_at = deleted_at


@pytest.fixture(autouse=True)
def _mock_collaborators(mocker):
    mocker.patch(f"{MODULE}.refresh_token_service.revoke_all_tokens_for_user", new_callable=AsyncMock, return_value=2)
    mocker.patch(f"{MODULE}.log_security_event", new_callable=AsyncMock)
    mocker.patch(f"{MODULE}.user_crud.delete", new_callable=AsyncMock)
    # Default: the row lock re-read finds the account still soft-deleted,
    # i.e. the common case where nothing raced the purge. Individual tests
    # override this to exercise the race-guard path.
    mocker.patch(
        f"{MODULE}.user_crud.lock_by_id",
        new_callable=AsyncMock,
        side_effect=lambda user_id, db: _FakeUser("locked@example.com", id=user_id),
    )


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
async def test_purge_raises_when_a_soft_deleted_account_was_reactivated_before_the_lock(mocker):
    """Regression guard: a batch job (account_purge_tasks.py) can hold a
    stale `user` snapshot (deleted_at set) read well before this call. If
    the row-lock re-read shows deleted_at is now None, a reactivation raced
    the purge and it must be refused, not silently proceed on the stale
    snapshot."""
    mocker.patch(
        f"{MODULE}.user_crud.lock_by_id",
        new_callable=AsyncMock,
        return_value=_FakeUser("reactivated-before-purge@example.com", deleted_at=None),
    )
    revoke_mock = mocker.patch(
        f"{MODULE}.refresh_token_service.revoke_all_tokens_for_user", new_callable=AsyncMock, return_value=2
    )
    delete_mock = mocker.patch(f"{MODULE}.user_crud.delete", new_callable=AsyncMock)
    stale_user = _FakeUser("reactivated-before-purge@example.com")  # deleted_at set, per the default

    with pytest.raises(AccountNoLongerEligibleForPurgeError):
        await purge_user_account(stale_user, db=MagicMock(), purged_by="system:grace_period_purge")

    revoke_mock.assert_not_awaited()
    delete_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_purge_raises_when_the_row_no_longer_exists(mocker):
    mocker.patch(f"{MODULE}.user_crud.lock_by_id", new_callable=AsyncMock, return_value=None)
    delete_mock = mocker.patch(f"{MODULE}.user_crud.delete", new_callable=AsyncMock)
    user = _FakeUser("already-gone@example.com")

    with pytest.raises(AccountNoLongerEligibleForPurgeError):
        await purge_user_account(user, db=MagicMock(), purged_by="admin@example.com")

    delete_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_purge_proceeds_for_a_still_active_account_an_admin_purges_directly(mocker):
    """An admin purging a never-soft-deleted account (DELETE /users/{email}/purge
    with no prior soft delete) is a legitimate, separate call shape with no
    deleted_at precondition to regress on -- must not be rejected by the
    reactivation-race guard above."""
    mocker.patch(
        f"{MODULE}.user_crud.lock_by_id",
        new_callable=AsyncMock,
        return_value=_FakeUser("still-active@example.com", deleted_at=None),
    )
    delete_mock = mocker.patch(f"{MODULE}.user_crud.delete", new_callable=AsyncMock)
    user = _FakeUser("still-active@example.com", deleted_at=None)

    await purge_user_account(user, db=MagicMock(), purged_by="admin@example.com")

    delete_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_purge_passes_the_users_id_to_the_row_lock(mocker):
    lock_mock = mocker.patch(
        f"{MODULE}.user_crud.lock_by_id",
        new_callable=AsyncMock,
        return_value=_FakeUser("purge-me@example.com", id=42),
    )
    user = _FakeUser("purge-me@example.com", id=42)
    db = MagicMock()

    await purge_user_account(user, db=db, purged_by="admin@example.com")

    lock_mock.assert_awaited_once_with(42, db)


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
