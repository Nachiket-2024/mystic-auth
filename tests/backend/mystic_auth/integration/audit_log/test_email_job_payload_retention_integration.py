import asyncio

import pytest
from sqlalchemy import text

from backend.mystic_auth.database.connection import database
from backend.mystic_auth.procrastinate_tasks.account_lifecycle_tasks import (
    deliver_account_lifecycle_event_task,
)
from backend.mystic_auth.procrastinate_tasks.email_tasks import send_email_task


@pytest.mark.asyncio
async def test_successful_email_job_keeps_metadata_but_not_rendered_body():
    secret_fixture = "reset-token-retention-test-fixture"
    job_id = await send_email_task.defer_async(
        to_email="recipient@example.test",
        subject="Password reset",
        body=f"Reset link token={secret_fixture}",
        is_html=False,
    )
    assert isinstance(job_id, int)

    row = None
    for _ in range(100):
        async with database.async_session() as session:
            result = await session.execute(
                text("SELECT status, args FROM procrastinate_jobs WHERE id = :job_id"),
                {"job_id": job_id},
            )
            row = result.mappings().one_or_none()
        # The worker deletes a job the moment it succeeds (delete_jobs=
        # "successful"); the payload redaction is the fallback if a row is
        # ever kept. Either way no payload may remain.
        if row is None or row["status"] == "succeeded":
            break
        await asyncio.sleep(0.1)

    assert row is None or row["args"] == {}
    assert row is None or secret_fixture not in str(row["args"])


@pytest.mark.asyncio
async def test_successful_lifecycle_job_redacts_purged_account_identifiers():
    job_id = await deliver_account_lifecycle_event_task.defer_async(
        event={
            "event_type": "purged",
            "user_id": 987654321,
            "user_email": "purged-job-retention@example.test",
            "actor": "operator-retention@example.test",
            "source": "management_purge",
            "occurred_at": "2026-10-23T00:00:00+00:00",
        },
        outbox_id=None,
    )
    assert isinstance(job_id, int)

    row = None
    for _ in range(100):
        async with database.async_session() as session:
            result = await session.execute(
                text("SELECT status, args FROM procrastinate_jobs WHERE id = :job_id"),
                {"job_id": job_id},
            )
            row = result.mappings().one_or_none()
        if row is None or row["status"] == "succeeded":
            break
        await asyncio.sleep(0.1)

    assert row is None or row["args"] == {}
