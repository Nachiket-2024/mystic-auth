# Google re-authentication that unlocks passkey changes. Only the two outbound
# Google calls are mocked; state, Valkey, Postgres, and sessions are real.
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import update

from backend.mystic_auth.database.connection import database
from backend.mystic_auth.user.user_crud_collector import user_crud
from backend.mystic_auth.user_session.session_model import UserSession

from .auth_test_accounts import signup_verify_login, unique_email

HANDLER_MODULE = "backend.mystic_auth.auth.oauth2.oauth2_login_handler"


def _mock_google(mocker, email: str, email_verified: bool = True):
    mocker.patch(
        f"{HANDLER_MODULE}.oauth2_service.exchange_code_for_tokens",
        new_callable=AsyncMock,
        return_value={"access_token": "fake-google-access-token"},
    )
    mocker.patch(
        f"{HANDLER_MODULE}.oauth2_service.get_user_info",
        new_callable=AsyncMock,
        return_value={"email": email, "email_verified": email_verified, "name": "G"},
    )


async def _age_session(email: str) -> None:
    async with database.async_session() as db:
        user = await user_crud.get_by_email(email, db)
        await db.execute(
            update(UserSession)
            .where(UserSession.user_id == user.id)
            .values(created_at=datetime.now(UTC) - timedelta(minutes=20))
        )
        await db.commit()


async def _blocked(client) -> int:
    return (await client.post("/auth/passkeys/registration/options", json={"name": "Key"})).status_code


async def _start(client) -> str:
    response = await client.get("/auth/passkeys/step-up/google")
    assert response.status_code in (302, 307)
    return response.headers["location"]


@pytest.mark.asyncio
async def test_google_step_up_unlocks_passkey_changes_without_replacing_the_session(client, created_emails, mocker):
    email = unique_email()
    await signup_verify_login(client, created_emails, email)
    await _age_session(email)
    assert await _blocked(client) == 403

    location = await _start(client)
    query = parse_qs(urlsplit(location).query)
    assert urlsplit(location).netloc == "accounts.google.com"
    assert query["prompt"] == ["login"]
    assert query["login_hint"] == [email]

    _mock_google(mocker, email)
    callback = await client.get("/auth/oauth2/callback/google", params={"code": "c", "state": query["state"][0]})

    assert callback.headers["location"].endswith("/account-settings?tab=passkeys&stepup=ok")
    assert "access_token" not in callback.cookies  # step-up never swaps the login session
    assert await _blocked(client) == 200


@pytest.mark.asyncio
async def test_google_step_up_rejects_a_different_google_account(client, created_emails, mocker):
    email = unique_email()
    await signup_verify_login(client, created_emails, email)
    await _age_session(email)
    query = parse_qs(urlsplit(await _start(client)).query)

    _mock_google(mocker, "someone-else@example.com")
    callback = await client.get("/auth/oauth2/callback/google", params={"code": "c", "state": query["state"][0]})

    assert callback.headers["location"].endswith("stepup=PASSKEY_STEP_UP_FAILED")
    assert await _blocked(client) == 403


@pytest.mark.asyncio
async def test_google_step_up_rejects_an_unverified_google_email(client, created_emails, mocker):
    email = unique_email()
    await signup_verify_login(client, created_emails, email)
    await _age_session(email)
    query = parse_qs(urlsplit(await _start(client)).query)

    _mock_google(mocker, email, email_verified=False)
    callback = await client.get("/auth/oauth2/callback/google", params={"code": "c", "state": query["state"][0]})

    assert callback.headers["location"].endswith("stepup=OAUTH_EMAIL_NOT_VERIFIED")
    assert await _blocked(client) == 403


@pytest.mark.asyncio
async def test_google_step_up_cancel_returns_to_the_passkeys_tab_and_state_is_single_use(
    client, created_emails, mocker
):
    email = unique_email()
    await signup_verify_login(client, created_emails, email)
    await _age_session(email)
    query = parse_qs(urlsplit(await _start(client)).query)
    state = query["state"][0]

    cancelled = await client.get("/auth/oauth2/callback/google", params={"error": "access_denied", "state": state})
    assert cancelled.headers["location"].endswith("stepup=OAUTH_CANCELLED")

    _mock_google(mocker, email)
    replay = await client.get("/auth/oauth2/callback/google", params={"code": "c", "state": state})
    assert "stepup=ok" not in replay.headers["location"]
    assert await _blocked(client) == 403


@pytest.mark.asyncio
async def test_google_step_up_requires_a_signed_in_session(client):
    response = await client.get("/auth/passkeys/step-up/google")

    assert response.headers["location"].endswith("stepup=PASSKEY_STEP_UP_FAILED")
