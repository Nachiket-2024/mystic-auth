import hashlib

from backend.mystic_auth.valkey.key_names import one_time_token_key


def test_key_is_prefix_plus_sha256_and_never_contains_the_token():
    token = "eyJhbGciOi.payload-with-user@example.com.sig"
    key = one_time_token_key("verify", token)

    assert key == f"verify:{hashlib.sha256(token.encode()).hexdigest()}"
    assert token not in key
    assert "@" not in key


def test_different_tokens_and_prefixes_give_different_keys():
    assert one_time_token_key("verify", "a") != one_time_token_key("verify", "b")
    assert one_time_token_key("verify", "a") != one_time_token_key("account_delete", "a")


def test_email_key_id_hides_the_address_and_normalizes_case():
    from backend.mystic_auth.valkey.key_names import email_key_id

    a = email_key_id("User@Example.com ")
    assert a == email_key_id("user@example.com")
    assert "@" not in a and "example" not in a
    assert len(a) == 64
    assert a != email_key_id("other@example.com")
