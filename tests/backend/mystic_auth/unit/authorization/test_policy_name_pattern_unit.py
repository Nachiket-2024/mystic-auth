import pytest
from pydantic import ValidationError

from backend.mystic_auth.authorization.schemas.policy_schema import (
    PolicyCreate,
    PolicyUpdate,
)

_BASE = {"actions": ["users:read_own"], "resource_type": "users"}


@pytest.mark.parametrize("name", ["self_service", "policy-v2", "app:projects.read", "A1"])
def test_ordinary_policy_names_are_accepted(name):
    assert PolicyCreate(name=name, **_BASE).name == name


@pytest.mark.parametrize(
    "name",
    ["../../etc/passwd", "<script>1</script>", "a b", "%00", "x\x00y", "\u202eevil", "\U0001f600", "' OR 1=1--", "_leading"],
)
def test_names_that_cannot_be_a_url_segment_or_could_impersonate_are_rejected(name):
    with pytest.raises(ValidationError):
        PolicyCreate(name=name, **_BASE)
    with pytest.raises(ValidationError):
        PolicyUpdate(name=name)
