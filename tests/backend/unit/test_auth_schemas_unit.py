# tests/backend/unit/test_auth_schemas_unit.py
#
# Regression guard: name/password/token fields across the auth request
# schemas previously accepted unbounded-length strings, which then get fed
# straight into Argon2 hashing (password/name) or Redis/JWT operations
# (tokens). These are pure schema-level unit tests since handlers take
# plain str arguments and bypass FastAPI's request-parsing/validation layer
# entirely — only a Pydantic model instantiation (or a real HTTP request,
# covered separately in integration tests) actually exercises these limits.
import pytest
from pydantic import ValidationError

from backend.app.auth.login.login_schema import LoginSchema
from backend.app.auth.password_reset_confirm.password_reset_confirm_schema import PasswordResetConfirmSchema
from backend.app.auth.signup.signup_schema import SignupSchema
from backend.app.auth.verify_account.verify_account_schema import VerifyAccountSchema


def test_signup_rejects_name_over_max_length():
    with pytest.raises(ValidationError):
        SignupSchema(name="a" * 101, email="user@example.com", password="ValidPass123!")


def test_signup_accepts_name_at_max_length():
    schema = SignupSchema(name="a" * 100, email="user@example.com", password="ValidPass123!")
    assert len(schema.name) == 100


def test_signup_rejects_password_over_max_length():
    with pytest.raises(ValidationError):
        SignupSchema(name="Test User", email="user@example.com", password="a" * 129)


def test_signup_accepts_password_at_max_length():
    schema = SignupSchema(name="Test User", email="user@example.com", password="a" * 128)
    assert len(schema.password) == 128


def test_login_rejects_password_over_max_length():
    with pytest.raises(ValidationError):
        LoginSchema(email="user@example.com", password="a" * 129)


def test_login_accepts_password_at_max_length():
    schema = LoginSchema(email="user@example.com", password="a" * 128)
    assert len(schema.password) == 128


def test_password_reset_confirm_rejects_token_over_max_length():
    with pytest.raises(ValidationError):
        PasswordResetConfirmSchema(token="a" * 2049, new_password="ValidPass123!")


def test_password_reset_confirm_rejects_new_password_over_max_length():
    with pytest.raises(ValidationError):
        PasswordResetConfirmSchema(token="valid-token", new_password="a" * 129)


def test_password_reset_confirm_accepts_values_at_max_length():
    schema = PasswordResetConfirmSchema(token="a" * 2048, new_password="a" * 128)
    assert len(schema.token) == 2048
    assert len(schema.new_password) == 128


def test_verify_account_schema_rejects_token_over_max_length():
    with pytest.raises(ValidationError):
        VerifyAccountSchema(token="a" * 2049)


def test_verify_account_schema_accepts_token_at_max_length():
    schema = VerifyAccountSchema(token="a" * 2048)
    assert len(schema.token) == 2048
