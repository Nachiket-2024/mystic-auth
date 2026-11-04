"""Inclusive window edges and missing bounds, found untested by mutation testing."""
import pytest

from backend.mystic_auth.authorization.conditions.condition_types.time_condition import (
    TimeCondition,
)

DAY = {"start": "09:00", "end": "17:00", "timezone": "UTC"}
NIGHT = {"start": "22:00", "end": "06:00", "timezone": "UTC"}


def check(value, at):
    return TimeCondition().evaluate(value, "u@example.com", None, {"current_time": f"2026-07-15T{at}+00:00"})


@pytest.mark.parametrize("at,expected", [
    ("09:00:00", True), ("08:59:59", False), ("17:00:00", True), ("17:00:01", False), ("12:00:00", True),
])
def test_day_window_edges_are_inclusive(at, expected):
    assert check(DAY, at) is expected


@pytest.mark.parametrize("at,expected", [
    ("22:00:00", True), ("21:59:59", False), ("06:00:00", True), ("06:00:01", False),
    ("23:30:00", True), ("03:00:00", True), ("12:00:00", False),
])
def test_overnight_window_edges_and_wrap(at, expected):
    assert check(NIGHT, at) is expected


def test_single_instant_window():
    assert check({"start": "10:00", "end": "10:00", "timezone": "UTC"}, "10:00:00") is True
    assert check({"start": "10:00", "end": "10:00", "timezone": "UTC"}, "10:00:01") is False


@pytest.mark.parametrize("value", [
    {"start": "09:00", "timezone": "UTC"}, {"end": "17:00", "timezone": "UTC"}, {"timezone": "UTC"},
    {"start": "", "end": "17:00"}, {"start": "09:00", "end": ""},
])
def test_missing_bound_denies(value):
    assert check(value, "12:00:00") is False
