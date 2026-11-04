from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.mystic_auth.audit_log.audit_log_repository import audit_log_repository


@pytest.mark.asyncio
async def test_login_trend_uses_exact_inclusive_bounds_and_returns_every_day():
    result = MagicMock()
    result.__iter__.return_value = iter(
        [SimpleNamespace(day=datetime(2026, 1, 2, tzinfo=UTC).date(), success=2, failure=1)]
    )
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)

    points = await audit_log_repository.get_login_trend(
        db,
        days=90,
        from_=datetime(2026, 1, 1, tzinfo=UTC),
        to=datetime(2026, 1, 3, 23, 59, 59, 999999, tzinfo=UTC),
    )

    assert [point["date"] for point in points] == ["2026-01-01", "2026-01-02", "2026-01-03"]
    assert points[0]["success"] == 0
    assert points[1] == {"date": "2026-01-02", "success": 2, "failure": 1}
    assert points[2]["failure"] == 0
    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_login_trend_rejects_an_inverted_exact_range_without_querying():
    db = MagicMock()
    db.execute = AsyncMock()

    points = await audit_log_repository.get_login_trend(
        db,
        from_=datetime(2026, 1, 3, tzinfo=UTC),
        to=datetime(2026, 1, 1, tzinfo=UTC),
    )

    assert points == []
    db.execute.assert_not_awaited()


@pytest.mark.parametrize(
    ("alias", "expected"),
    [
        ("login", {"login_success", "login_failure"}),
        ("passkey_login", {"passkey_login_success", "passkey_login_failure"}),
        ("passkey_step_up", {"passkey_step_up_success", "passkey_step_up_failure"}),
        ("passkey_removed", {"passkey_removed"}),
    ],
)
def test_event_type_filter_aliases_expand_to_success_and_failure_rows(alias, expected):
    from sqlalchemy import select

    from backend.mystic_auth.audit_log.audit_log_model import AuditLog
    from backend.mystic_auth.audit_log.audit_log_repository import _apply_filters

    sql = str(
        _apply_filters(select(AuditLog), None, alias, None, None).compile(compile_kwargs={"literal_binds": True})
    )

    for event in expected:
        assert f"'{event}'" in sql
    assert sql.count("'passkey_") + sql.count("'login_") == len(expected)


def test_sign_in_activity_counts_passkey_attempts():
    from backend.mystic_auth.audit_log import audit_log_repository

    assert {"passkey_login_success", "passkey_login_failure"} <= set(audit_log_repository._LOGIN_EVENT_TYPES)
