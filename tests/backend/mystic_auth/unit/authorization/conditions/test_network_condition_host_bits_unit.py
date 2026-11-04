"""A CIDR written with host bits set (10.0.0.5/24) is read as its network, not rejected; pinned after mutation testing."""
from backend.mystic_auth.authorization.conditions.condition_types.network_condition import (
    NetworkCondition,
)


def test_cidr_with_host_bits_matches_its_network():
    cond = NetworkCondition()
    assert cond.evaluate({"allowed_ips": ["10.0.0.5/24"]}, "u@example.com", None, {"ip_address": "10.0.0.200"}) is True
    assert cond.evaluate({"allowed_ips": ["10.0.0.5/24"]}, "u@example.com", None, {"ip_address": "10.0.1.1"}) is False
