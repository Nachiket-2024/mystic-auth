import unicodedata

import pytest
from argon2 import PasswordHasher

from backend.mystic_auth.auth.password_logic.password_service import (
    PasswordService,
    normalize_password,
    password_service,
)

NFC = unicodedata.normalize("NFC", "Café-Pass-1")
NFD = unicodedata.normalize("NFD", NFC)


def test_the_two_spellings_really_differ_as_strings():
    assert NFC != NFD
    assert normalize_password(NFC) == normalize_password(NFD)


@pytest.mark.asyncio
async def test_a_password_set_in_one_form_signs_in_with_the_other():
    hashed = await password_service.hash_password(NFC)
    assert await password_service.verify_password(NFD, hashed) is True
    assert await password_service.verify_password(NFC, hashed) is True


@pytest.mark.asyncio
async def test_compatibility_forms_match_too():
    # full-width letters and digits fold to ASCII under NFKC
    hashed = await password_service.hash_password("Passw0rd!x")
    assert await password_service.verify_password("Ｐassw０rd!x", hashed) is True


@pytest.mark.asyncio
async def test_a_wrong_password_is_still_rejected():
    hashed = await password_service.hash_password(NFC)
    assert await password_service.verify_password(NFC + "x", hashed) is False


@pytest.mark.asyncio
async def test_a_hash_made_before_normalization_still_verifies():
    legacy = PasswordHasher().hash(NFD)  # hashed exactly as typed, un-normalized
    assert await password_service.verify_password(NFD, legacy) is True


@pytest.mark.asyncio
async def test_ascii_passwords_cost_a_single_hash_check(mocker):
    hashed = await password_service.hash_password("Plain-Pass-1")
    spy = mocker.spy(PasswordService, "_matches")
    assert await password_service.verify_password("wrong-Pass-1", hashed) is False
    assert spy.call_count == 1
