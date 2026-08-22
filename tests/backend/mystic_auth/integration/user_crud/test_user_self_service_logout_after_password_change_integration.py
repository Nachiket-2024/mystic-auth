# tests/backend/mystic_auth/integration/user_crud/test_user_self_service_logout_after_password_change_integration.py
#
# End-to-end coverage for /auth/logout and /auth/logout/all's robustness
# against the real ASGI app, real PostgreSQL, and real Redis (see
# conftest.py), specifically for a session whose refresh token was already
# revoked by a preceding PUT /users/me password change (see
# password_reset_service.py-style revoke-on-password-change).
#
# Split out of test_user_self_service_routes_integration.py once that file
# passed the repo's own file-length guideline: these tests exercise
# /auth/logout(/all) directly, not /users/me, but were authored alongside
# the self-service password-change tests as part of the same bug-fix
# investigation (a password change revokes the session's own refresh token
# but never rotates/clears its cookies, so the very next Logout click was
# presenting an already-revoked token) and stay grouped with it rather than
# being scattered into an unrelated auth file.
import pytest

from .user_test_accounts import PASSWORD, create_verified_user, post_with_refresh_cookie, unique_email


@pytest.mark.asyncio
async def test_logout_after_self_password_change_still_succeeds_and_clears_cookies(client, created_emails):
    # Regression guard for the actual bug report: PUT /users/me revokes the
    # session's own refresh token, but never rotates or clears its cookies,
    # so the browser is still holding that now-revoked refresh_token
    # cookie. Clicking Logout right after a password-change toast must not
    # surface "invalid refresh token or already revoked" and leave the user
    # stuck looking logged in; it must still succeed and actually clear
    # both cookies, exactly like a logout with a live token.
    email = unique_email()
    await create_verified_user(client, created_emails, email)

    update_resp = await client.put(
        "/users/me", json={"password": "NewStrongPass456!", "current_password": PASSWORD}
    )
    assert update_resp.status_code == 200
    assert any(cookie.name == "refresh_token" for cookie in client.cookies.jar)

    logout_resp = await client.post("/auth/logout")

    assert logout_resp.status_code == 200
    assert not any(cookie.name == "refresh_token" for cookie in client.cookies.jar)


@pytest.mark.asyncio
async def test_logout_all_after_self_password_change_still_succeeds_and_clears_cookies(client, created_emails):
    # Same regression, logout-all variant: logout_all_handler previously
    # rejected an already-revoked refresh token outright (it couldn't even
    # recover the owning email to revoke the account's *other* sessions),
    # unlike plain logout's revoke-then-fail path.
    email = unique_email()
    await create_verified_user(client, created_emails, email)

    update_resp = await client.put(
        "/users/me", json={"password": "NewStrongPass456!", "current_password": PASSWORD}
    )
    assert update_resp.status_code == 200
    assert any(cookie.name == "refresh_token" for cookie in client.cookies.jar)

    logout_all_resp = await client.post("/auth/logout/all")

    assert logout_all_resp.status_code == 200
    assert not any(cookie.name == "refresh_token" for cookie in client.cookies.jar)


@pytest.mark.asyncio
async def test_logout_all_returns_503_when_account_version_bump_is_unconfirmed(client, created_emails, mocker):
    # Regression guard for the "Redis outage failure modes are inconsistent"
    # gap: unlike an already-revoked presented token (nothing left to
    # revoke, goal already met), an unconfirmed account-version bump means
    # logout-all's actual purpose - revoking every session - genuinely
    # didn't happen, so it must not report success.
    email = unique_email()
    await create_verified_user(client, created_emails, email)

    mocker.patch(
        "backend.mystic_auth.auth.token_logic.jwt_service.jwt_service.bump_account_version",
        new_callable=mocker.AsyncMock,
        return_value=False,
    )

    logout_all_resp = await client.post("/auth/logout/all")

    assert logout_all_resp.status_code == 503
    assert logout_all_resp.json()["code"] == "SESSION_REVOCATION_UNAVAILABLE"
    # Cookies are still cleared: this browser's own copy of the goal is
    # unaffected by whether other devices actually got revoked.
    assert not any(cookie.name == "refresh_token" for cookie in client.cookies.jar)


@pytest.mark.asyncio
async def test_repeated_logout_calls_with_the_same_token_both_succeed(client, created_emails):
    # Simulates two tabs, or a client retrying a request it never saw the
    # response for: the same refresh_token value presented twice. The
    # second call's token is already revoked by the first and must still
    # succeed rather than error, exactly like the post-password-change case.
    email = unique_email()
    login_resp = await create_verified_user(client, created_emails, email)
    refresh_token = login_resp.cookies["refresh_token"]

    first_logout = await post_with_refresh_cookie(client, "/auth/logout", refresh_token)
    assert first_logout.status_code == 200

    second_logout = await post_with_refresh_cookie(client, "/auth/logout", refresh_token)
    assert second_logout.status_code == 200


@pytest.mark.asyncio
async def test_logout_with_malformed_refresh_token_cookie_still_succeeds_and_clears_cookies(client, created_emails):
    # Not just "a real but revoked token": a cookie value that isn't even
    # a decodable JWT at all (corrupted, truncated, tampered) must be
    # handled the same lenient way, not treated as a different error class.
    email = unique_email()
    await create_verified_user(client, created_emails, email)

    logout_resp = await post_with_refresh_cookie(client, "/auth/logout", "not-a-real-jwt")

    assert logout_resp.status_code == 200
    assert not any(cookie.name == "refresh_token" for cookie in client.cookies.jar)


@pytest.mark.asyncio
async def test_logout_all_with_malformed_refresh_token_cookie_still_succeeds_and_clears_cookies(
    client, created_emails
):
    email = unique_email()
    await create_verified_user(client, created_emails, email)

    logout_all_resp = await post_with_refresh_cookie(client, "/auth/logout/all", "not-a-real-jwt")

    assert logout_all_resp.status_code == 200
    assert not any(cookie.name == "refresh_token" for cookie in client.cookies.jar)
