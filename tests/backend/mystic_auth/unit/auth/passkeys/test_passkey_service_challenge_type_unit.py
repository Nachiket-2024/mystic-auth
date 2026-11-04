import base64
import json
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.passkeys.passkey_service import passkey_service


def _b64(obj) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


@pytest.mark.asyncio
async def test_finish_authentication_rejects_a_non_string_challenge_without_touching_the_database():
    db = AsyncMock()
    credential = {"rawId": _b64("x"), "response": {"clientDataJSON": _b64({"challenge": {"a": 1}})}}

    assert await passkey_service.finish_authentication(credential, db, "https://example.test") is None
    db.execute.assert_not_called()
    db.scalar.assert_not_called()


@pytest.mark.asyncio
async def test_finish_registration_rejects_a_non_string_challenge_without_touching_the_database():
    db = AsyncMock()
    credential = {"response": {"clientDataJSON": _b64({"challenge": 123})}}

    assert await passkey_service.finish_registration(AsyncMock(id=1), "name", credential, db, "https://example.test") is False
    db.execute.assert_not_called()
