# Unit coverage for /health and /health/ready, called directly as plain
# coroutines with DB/Valkey mocked, so both the healthy and failing paths
# are exercised without a real Postgres/Valkey connection.
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.mystic_auth.api.health_routes.health_routes import health, health_ready

MODULE = "backend.mystic_auth.api.health_routes.health_routes"


@pytest.mark.asyncio
async def test_health_returns_ok_with_no_dependency_checks():
    result = await health()
    assert result == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_ready_returns_200_when_all_dependencies_are_healthy(mocker):
    db = MagicMock()
    db.execute = AsyncMock(return_value=None)
    mocker.patch(f"{MODULE}.valkey_client.ping", new_callable=AsyncMock, return_value=True)

    response = await health_ready(db=db)

    assert response.status_code == 200
    body = json.loads(response.body.decode())
    assert body == {"status": "ok", "checks": {"database": "ok", "valkey": "ok"}}


@pytest.mark.asyncio
async def test_health_ready_returns_503_when_database_is_down(mocker):
    db = MagicMock()
    db.execute = AsyncMock(side_effect=RuntimeError("connection refused"))
    mocker.patch(f"{MODULE}.valkey_client.ping", new_callable=AsyncMock, return_value=True)

    response = await health_ready(db=db)

    assert response.status_code == 503
    body = json.loads(response.body.decode())
    assert body == {"status": "error", "checks": {"database": "error", "valkey": "ok"}}


@pytest.mark.asyncio
async def test_health_ready_returns_503_when_valkey_is_down(mocker):
    db = MagicMock()
    db.execute = AsyncMock(return_value=None)
    mocker.patch(f"{MODULE}.valkey_client.ping", new_callable=AsyncMock, side_effect=RuntimeError("timeout"))

    response = await health_ready(db=db)

    assert response.status_code == 503
    body = json.loads(response.body.decode())
    assert body == {"status": "error", "checks": {"database": "ok", "valkey": "error"}}
