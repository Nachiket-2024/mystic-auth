# End-to-end tests for /health and /health/ready, using the real app, Postgres,
# and Redis (via the `client` fixture in conftest.py). Confirms /health/ready
# actually checks both dependencies instead of just returning a static reply.
import pytest


@pytest.mark.asyncio
async def test_health_returns_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_ready_returns_ok_when_dependencies_are_reachable(client):
    resp = await client.get("/health/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"] == {"database": "ok", "redis": "ok"}
