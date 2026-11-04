"""A 503 from the Argon2 gate must reach the client; it must not become a 401, a silent signup drop, or a burned reset link."""
import time
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.auth.login.login_service import login_service
from backend.mystic_auth.auth.password_logic.password_reset_service import (
    password_reset_service,
)
from backend.mystic_auth.auth.signup.signup_handler import signup_handler
from backend.mystic_auth.auth.signup.signup_service import signup_service
from backend.mystic_auth.core.errors import service_unavailable_error


@pytest.mark.asyncio
async def test_login_service_lets_the_overload_error_through(mocker):
    mocker.patch("backend.mystic_auth.auth.login.login_service.user_crud.get_by_email", return_value=None)
    mocker.patch(
        "backend.mystic_auth.auth.login.login_service.password_service.verify_password",
        side_effect=service_unavailable_error(),
    )
    with pytest.raises(type(service_unavailable_error())) as raised:
        await login_service.login("a@example.com", "Password!2026a", db=None)
    assert raised.value.status_code == 503


@pytest.mark.asyncio
async def test_signup_service_lets_the_overload_error_through(mocker):
    mocker.patch("backend.mystic_auth.auth.signup.signup_service.user_crud.get_by_email", return_value=None)
    mocker.patch(
        "backend.mystic_auth.auth.signup.signup_service.password_service.hash_password",
        side_effect=service_unavailable_error(),
    )
    with pytest.raises(type(service_unavailable_error())):
        await signup_service.signup("New", "new@example.com", "Password!2026a", db=None)


@pytest.mark.asyncio
async def test_signup_handler_does_not_turn_overload_into_a_success_message(mocker):
    mocker.patch(
        "backend.mystic_auth.auth.signup.signup_handler.signup_service.signup",
        side_effect=service_unavailable_error(),
    )
    with pytest.raises(type(service_unavailable_error())):
        await signup_handler.handle_signup("N", "n@example.com", "Password!2026a", db=None)


@pytest.mark.asyncio
async def test_reset_password_restores_the_link_and_reports_overload(mocker):
    module = "backend.mystic_auth.auth.password_logic.password_reset_service"
    mocker.patch(
        f"{module}.password_service.verify_reset_token",
        return_value={"jti": "j1", "email": "u@example.com", "exp": time.time() + 600},
    )
    eval_mock = mocker.patch(f"{module}.valkey_client.eval", new_callable=AsyncMock, return_value=1)
    mocker.patch(f"{module}.password_service.validate_password_strength", return_value=True)
    mocker.patch(f"{module}.user_crud.get_by_email", return_value=type("U", (), {"hashed_password": "h"})())
    mocker.patch(f"{module}.password_service.verify_password", side_effect=service_unavailable_error())
    with pytest.raises(type(service_unavailable_error())):
        await password_reset_service.reset_password("tok", "Password!2026b", db=None)
    assert eval_mock.await_count == 2  # consumed, then put back
