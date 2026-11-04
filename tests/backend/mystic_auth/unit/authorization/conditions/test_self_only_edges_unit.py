"""Edges found untested by mutation testing: two missing emails, and a resource that blows up."""

from backend.mystic_auth.authorization.conditions.condition_types.self_only_condition import (
    SelfOnlyCondition,
)


def test_two_missing_emails_are_not_a_match():
    cond = SelfOnlyCondition()
    assert cond.evaluate(True, None, {"email": None}, {}) is False
    assert cond.evaluate(True, "", {"other": 1}, {}) is False


def test_one_missing_email_denies():
    cond = SelfOnlyCondition()
    assert cond.evaluate(True, "a@example.com", {"email": None}, {}) is False
    assert cond.evaluate(True, None, {"email": "a@example.com"}, {}) is False


def test_matching_emails_allow_and_different_deny():
    cond = SelfOnlyCondition()
    assert cond.evaluate(True, "a@example.com", {"email": "a@example.com"}, {}) is True
    assert cond.evaluate(True, "a@example.com", {"email": "b@example.com"}, {}) is False


def test_evaluation_error_denies(mocker):
    mocker.patch(
        "backend.mystic_auth.authorization.conditions.condition_types.self_only_condition.get_field",
        side_effect=RuntimeError("boom"),
    )
    assert SelfOnlyCondition().evaluate(True, "a@example.com", {"email": "a@example.com"}, {}) is False
