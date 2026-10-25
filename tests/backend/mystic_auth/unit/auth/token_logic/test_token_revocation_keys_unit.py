from backend.mystic_auth.auth.token_logic.token_revocation_keys import (
    account_version_key,
    chain_version_key,
    hmac_key_from_legacy_key,
)


def test_account_key_is_stable_case_insensitive_and_does_not_contain_email():
    first = account_version_key("Person@example.test")

    assert first == account_version_key("person@example.test")
    assert "person@example.test" not in first
    assert first.startswith("account_ver:v2:")


def test_chain_key_binds_account_and_chain_without_email():
    first = chain_version_key("person@example.test", "chain-1")

    assert first == chain_version_key("Person@example.test", "chain-1")
    assert first != chain_version_key("other@example.test", "chain-1")
    assert "person@example.test" not in first
    assert first.endswith(":chain-1")


def test_legacy_account_and_chain_keys_map_to_v2_keys():
    assert hmac_key_from_legacy_key("account_ver:person@example.test") == account_version_key("person@example.test")
    assert hmac_key_from_legacy_key("chain_ver:person@example.test:chain-1") == chain_version_key(
        "person@example.test", "chain-1"
    )


def test_unknown_or_malformed_keys_are_not_migrated():
    assert hmac_key_from_legacy_key("unrelated:person@example.test") is None
    assert hmac_key_from_legacy_key("chain_ver:person@example.test:") is None
