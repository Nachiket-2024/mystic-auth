import pytest
from fastapi import HTTPException

from backend.mystic_auth.auth.passkeys import passkey_origin
from backend.mystic_auth.auth.passkeys.passkey_origin import validated_origin


class _Request:
    def __init__(self, origin: str | None):
        self.headers = {} if origin is None else {"origin": origin}


def test_allowed_origin_is_returned(monkeypatch):
    monkeypatch.setattr(passkey_origin.settings, "WEBAUTHN_ORIGINS", "https://app.example.com, https://example.com")

    assert validated_origin(_Request("https://app.example.com")) == "https://app.example.com"


@pytest.mark.parametrize("origin", [None, "", "https://evil.example.com", "https://app.example.com.evil.test", "http://app.example.com"])
def test_missing_or_unlisted_origin_is_rejected(monkeypatch, origin):
    monkeypatch.setattr(passkey_origin.settings, "WEBAUTHN_ORIGINS", "https://app.example.com")

    with pytest.raises(HTTPException) as error:
        validated_origin(_Request(origin))

    assert error.value.status_code == 400
