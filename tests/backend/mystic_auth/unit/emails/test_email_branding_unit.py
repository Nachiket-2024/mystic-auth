"""Verification and reset emails take their button color from the BRAND_COLOR setting."""
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from backend.mystic_auth.auth.verify_account import (
    account_verification_service as verify_mod,
)
from backend.mystic_auth.core.settings import Settings, settings


def test_default_brand_color_matches_the_frontend_default():
    assert Settings.model_fields["BRAND_COLOR"].default == "#b5533c"


@pytest.mark.parametrize("bad", ["red", "#fff", "#12345g", "b5533c", "#b5533c;x", "#b5533c22", ""])
def test_brand_color_must_be_a_plain_hex(bad):
    with pytest.raises(ValidationError):
        Settings.model_validate({**settings.model_dump(), "BRAND_COLOR": bad})


def test_brand_color_accepts_either_letter_case():
    ok = Settings.model_validate({**settings.model_dump(), "BRAND_COLOR": "#AbCdEf"})
    assert ok.BRAND_COLOR == "#AbCdEf"


@pytest.mark.asyncio
async def test_verification_email_button_uses_the_configured_brand_color(mocker, monkeypatch):
    monkeypatch.setattr(settings, "BRAND_COLOR", "#112233")
    mocker.patch.object(verify_mod.valkey_client, "set", new_callable=AsyncMock)
    defer = mocker.patch.object(verify_mod.send_email_task, "defer_async", new_callable=AsyncMock)

    assert await verify_mod.account_verification_service.send_verification_email("a@example.com") is True

    body = defer.await_args.kwargs["body"]
    assert "background-color:#112233" in body
    assert "#b5533c" not in body


@pytest.mark.asyncio
async def test_verification_link_carries_the_address_in_the_fragment_only(mocker):
    mocker.patch.object(verify_mod.valkey_client, "set", new_callable=AsyncMock)
    defer = mocker.patch.object(verify_mod.send_email_task, "defer_async", new_callable=AsyncMock)

    await verify_mod.account_verification_service.send_verification_email("a+b@example.com")

    body = defer.await_args.kwargs["body"]
    link = next(part for part in body.replace('"', " ").split() if "/verify-account" in part)
    path, _, fragment = link.partition("#")
    assert "token=" in fragment and "email=a%2Bb%40example.com" in fragment
    assert "?" not in path and "@" not in path  # nothing sensitive in the query or path
