from backend.mystic_auth.auth.login.login_handler import LoginHandler
from backend.mystic_auth.auth.security.rate_limiting.account_keys import (
    account_ip_digest,
)


def test_login_lock_key_is_built_from_the_shared_digest():
    assert LoginHandler._lock_key("A@Example.com", "203.0.113.5") == (
        f"login_lock:account_ip:{account_ip_digest('a@example.com', '203.0.113.5')}"
    )


def test_email_case_and_spaces_do_not_change_the_digest():
    assert account_ip_digest("  User@Example.COM ", "203.0.113.5") == account_ip_digest("user@example.com", "203.0.113.5")


def test_different_account_or_network_gives_a_different_digest():
    base = account_ip_digest("user@example.com", "203.0.113.5")
    assert account_ip_digest("other@example.com", "203.0.113.5") != base
    assert account_ip_digest("user@example.com", "203.0.113.6") != base


def test_addresses_in_one_ipv6_64_share_a_digest():
    assert account_ip_digest("user@example.com", "2001:db8:1:2::1") == account_ip_digest("user@example.com", "2001:db8:1:2:ffff::9")
    assert account_ip_digest("user@example.com", "2001:db8:1:2::1") != account_ip_digest("user@example.com", "2001:db8:1:3::1")


def test_purpose_keeps_a_separate_bucket():
    assert account_ip_digest("user@example.com", "203.0.113.5", purpose="stepup") != account_ip_digest("user@example.com", "203.0.113.5")
