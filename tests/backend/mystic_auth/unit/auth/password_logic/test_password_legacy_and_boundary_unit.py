"""Boundaries found by mutation testing: the legacy-hash fallback and the minimum length edge."""
import unicodedata

import pytest
from argon2 import PasswordHasher

from backend.mystic_auth.auth.password_logic.password_service import password_service


@pytest.mark.asyncio
async def test_password_hashed_before_normalization_still_verifies():
    typed = unicodedata.normalize("NFD", "Pässword1")  # exactly as typed, not NFKC
    legacy_hash = PasswordHasher().hash(typed)
    assert await password_service.verify_password(typed, legacy_hash) is True
    # a different password still fails
    assert await password_service.verify_password("Pässword2", legacy_hash) is False


@pytest.mark.asyncio
@pytest.mark.parametrize("password,ok", [("Abcdef1x", True), ("Abcde1x", False)])
async def test_minimum_length_is_exactly_eight(password, ok):
    assert await password_service.validate_password_strength(password) is ok
