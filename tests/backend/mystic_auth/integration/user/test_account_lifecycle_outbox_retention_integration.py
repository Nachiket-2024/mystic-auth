from datetime import UTC, datetime

import pytest

from backend.mystic_auth.database.connection import database
from backend.mystic_auth.user_lifecycle.account_lifecycle_events import (
    mark_account_lifecycle_event_delivered,
)
from backend.mystic_auth.user_lifecycle.account_lifecycle_outbox_model import (
    AccountLifecycleOutbox,
)


@pytest.mark.asyncio
async def test_delivered_lifecycle_outbox_retains_transition_but_redacts_identity():
    async with database.async_session() as session:
        outbox = AccountLifecycleOutbox(
            event_type="purged",
            user_id=987654321,
            user_email="purged-retention@example.test",
            actor="operator-retention@example.test",
            source="admin_purge",
            occurred_at=datetime.now(UTC),
        )
        session.add(outbox)
        await session.commit()
        outbox_id = outbox.id

    try:
        await mark_account_lifecycle_event_delivered(outbox_id)

        async with database.async_session() as session:
            row = await session.get(AccountLifecycleOutbox, outbox_id)
            assert row is not None
            assert row.delivered_at is not None
            assert row.event_type == "purged"
            assert row.source == "admin_purge"
            assert row.user_id is None
            assert row.user_email == ""
            assert row.actor == "redacted"
    finally:
        async with database.async_session() as session:
            row = await session.get(AccountLifecycleOutbox, outbox_id)
            if row is not None:
                await session.delete(row)
                await session.commit()
