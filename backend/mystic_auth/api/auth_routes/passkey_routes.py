from fastapi import APIRouter, Cookie, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth.current_user.current_user_handler import current_user_handler
from ...auth.passkeys.passkey_google_step_up_handler import passkey_google_step_up_handler
from ...auth.passkeys.passkey_handler import passkey_handler
from ...auth.passkeys.passkey_schema import (
    PasskeyAuthenticationFinishSchema,
    PasskeyBulkRemoveSchema,
    PasskeyNameSchema,
    PasskeyRegistrationFinishSchema,
    PasskeyStepUpPasswordSchema,
)
from ...auth.passkeys.passkey_step_up_handler import passkey_step_up_handler
from ...auth.security.rate_limiting.account_keys import access_token_account_key
from ...auth.security.rate_limiting.rate_limiter_service import rate_limiter_service
from ...core.settings import settings
from ...database.connection import database

# Mounted under /auth by auth_routes.py (router.include_router), so every path
# here is /auth/passkeys/... Management routes are rate limited per account and
# per IP; the two sign-in routes are anonymous, so per IP only.
router = APIRouter(prefix="/passkeys", tags=["Passkeys"])

# The Google step-up route is a top-level browser navigation that ends in a
# redirect, so a rate-limit rejection must redirect back to the Passkeys tab
# instead of rendering a raw JSON 429 (same reason as the OAuth2 login routes).
_STEP_UP_RATE_LIMIT_REDIRECT_URL = f"{settings.FRONTEND_BASE_URL}/account-settings?tab=passkeys&stepup=TOO_MANY_ATTEMPTS"


@router.post("/authentication/options")
@rate_limiter_service.rate_limited("passkey_login", max_requests=20, window_seconds=60)
async def passkey_authentication_options(request: Request, db: AsyncSession = Depends(database.get_session)):
    return await passkey_handler.begin_authentication(db)


@router.post("/authentication/verify")
@rate_limiter_service.rate_limited("passkey_login", max_requests=20, window_seconds=60)
async def passkey_authentication_verify(
    payload: PasskeyAuthenticationFinishSchema, request: Request, db: AsyncSession = Depends(database.get_session)
):
    return await passkey_handler.complete_authentication(payload.model_dump(), request, db)


@router.get("")
@rate_limiter_service.rate_limited("passkey_management", account_key_func=access_token_account_key)
async def list_passkeys(
    request: Request, access_token: str = Cookie(None), db: AsyncSession = Depends(database.get_session)
):
    current = await current_user_handler.get_current_user(access_token, db=db)
    return await passkey_handler.list_credentials(current["email"], db)


@router.post("/step-up/password")
@rate_limiter_service.rate_limited("passkey_step_up", account_key_func=access_token_account_key)
async def passkey_step_up_password(
    payload: PasskeyStepUpPasswordSchema,
    request: Request,
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(database.get_session),
):
    current = await current_user_handler.get_current_user(access_token, db=db)
    return await passkey_step_up_handler.confirm_with_password(current["email"], access_token, payload.password, request, db)


@router.post("/step-up/passkey")
@rate_limiter_service.rate_limited("passkey_step_up", account_key_func=access_token_account_key)
async def passkey_step_up_passkey(
    payload: PasskeyAuthenticationFinishSchema,
    request: Request,
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(database.get_session),
):
    current = await current_user_handler.get_current_user(access_token, db=db)
    return await passkey_step_up_handler.confirm_with_passkey(
        current["email"], access_token, payload.model_dump(), request, db
    )


@router.get("/step-up/google")
@rate_limiter_service.rate_limited(
    "passkey_step_up_google", redirect_url=_STEP_UP_RATE_LIMIT_REDIRECT_URL, max_requests=10, window_seconds=60
)
async def passkey_step_up_google(request: Request, access_token: str = Cookie(None), db: AsyncSession = Depends(database.get_session)):
    """Top-level navigation that re-authenticates with Google, then returns to the Passkeys tab."""
    return await passkey_google_step_up_handler.initiate(access_token, db)


@router.post("/registration/options")
@rate_limiter_service.rate_limited("passkey_management", account_key_func=access_token_account_key)
async def passkey_registration_options(
    payload: PasskeyNameSchema,
    request: Request,
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(database.get_session),
):
    current = await current_user_handler.get_current_user(access_token, db=db)
    await passkey_step_up_handler.require_step_up(current["email"], access_token, db)
    return await passkey_handler.begin_registration(current["email"], payload.normalized_name(), db)


@router.post("/registration/verify")
@rate_limiter_service.rate_limited("passkey_management", account_key_func=access_token_account_key)
async def passkey_registration_verify(
    payload: PasskeyRegistrationFinishSchema,
    request: Request,
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(database.get_session),
):
    current = await current_user_handler.get_current_user(access_token, db=db)
    await passkey_step_up_handler.require_step_up(current["email"], access_token, db)
    name = payload.normalized_name()
    return await passkey_handler.complete_registration(current["email"], name, payload.credential, request, db)


@router.post("/bulk-remove")
@rate_limiter_service.rate_limited("passkey_management", account_key_func=access_token_account_key)
async def bulk_remove_passkeys(
    payload: PasskeyBulkRemoveSchema,
    request: Request,
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(database.get_session),
):
    current = await current_user_handler.get_current_user(access_token, db=db)
    await passkey_step_up_handler.require_step_up(current["email"], access_token, db)
    return await passkey_handler.remove_credentials(current["email"], None if payload.all else payload.ids, request, db)


@router.patch("/{credential_id}")
@rate_limiter_service.rate_limited("passkey_management", account_key_func=access_token_account_key)
async def rename_passkey(
    credential_id: int,
    payload: PasskeyNameSchema,
    request: Request,
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(database.get_session),
):
    current = await current_user_handler.get_current_user(access_token, db=db)
    return await passkey_handler.rename_credential(
        current["email"], credential_id, payload.normalized_name(), request, db
    )


@router.delete("/{credential_id}")
@rate_limiter_service.rate_limited("passkey_management", account_key_func=access_token_account_key)
async def delete_passkey(
    credential_id: int,
    request: Request,
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(database.get_session),
):
    current = await current_user_handler.get_current_user(access_token, db=db)
    await passkey_step_up_handler.require_step_up(current["email"], access_token, db)
    return await passkey_handler.remove_credential(current["email"], credential_id, request, db)
