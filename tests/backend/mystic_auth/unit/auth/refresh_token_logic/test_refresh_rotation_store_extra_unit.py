"""Grace-window handling for the pre-Postgres Valkey marker, and the store-outage path."""
import time
import uuid

import pytest

from backend.mystic_auth.auth.refresh_token_logic.refresh_rotation_store import (
    is_benign_duplicate_rotation,
)
from backend.mystic_auth.auth.token_logic.token_version_store import (
    TokenVersionUnavailableError,
)
from backend.mystic_auth.valkey.client import valkey_client


@pytest.fixture
def jti():
    return f"legacy-{uuid.uuid4().hex}"


@pytest.mark.asyncio
async def test_legacy_marker_from_the_same_ip_inside_the_grace_window_is_benign(jti):
    await valkey_client.set(f"revoked:{jti}", f"{time.time()}|203.0.113.7", ex=60)
    assert await is_benign_duplicate_rotation(jti, "203.0.113.7") is True


@pytest.mark.asyncio
async def test_legacy_marker_from_another_ip_is_not_benign(jti):
    await valkey_client.set(f"revoked:{jti}", f"{time.time()}|203.0.113.7", ex=60)
    assert await is_benign_duplicate_rotation(jti, "198.51.100.9") is False


@pytest.mark.asyncio
async def test_legacy_marker_past_the_grace_window_is_not_benign(jti):
    await valkey_client.set(f"revoked:{jti}", f"{time.time() - 3600}|203.0.113.7", ex=60)
    assert await is_benign_duplicate_rotation(jti, "203.0.113.7") is False


@pytest.mark.asyncio
async def test_a_marker_without_a_timestamp_is_not_benign(jti):
    await valkey_client.set(f"revoked:{jti}", "1", ex=60)
    assert await is_benign_duplicate_rotation(jti, "203.0.113.7") is False


@pytest.mark.asyncio
async def test_store_outage_is_surfaced_not_treated_as_benign(jti, mocker):
    class _BrokenDatabase:
        def async_session(self):
            raise ConnectionError("postgres down")

    with pytest.raises(TokenVersionUnavailableError):
        await is_benign_duplicate_rotation(jti, "203.0.113.7", database=_BrokenDatabase())
