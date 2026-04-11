# ---------------------------- External Imports ----------------------------
# FastAPI router for grouping endpoints, Depends for dependency injection, and response handling
from fastapi import APIRouter, Depends

# Async SQLAlchemy session for database interactions
from sqlalchemy.ext.asyncio import AsyncSession

# FastAPI Request, Cookie dependency to read cookies from requests
from fastapi import Cookie, Request

# ---------------------------- Internal Imports ----------------------------
# Schema for signup requests
from ...auth.signup.signup_schema import SignupSchema

# Schema for login requests
from ...auth.login.login_schema import LoginSchema

# Schema for password reset confirmation requests
from ...auth.password_reset_confirm.password_reset_confirm_schema import PasswordResetConfirmSchema

# Schema for password reset request
from ...auth.password_reset_request.password_reset_request_schema import PasswordResetRequestSchema

# Handler to process user registration
from ...auth.signup.signup_handler import signup_handler

# Handler to process user login
from ...auth.login.login_handler import login_handler

# Handler to initiate OAuth2 login (e.g., Google)
from ...auth.oauth2.oauth2_login_handler import oauth2_login_handler

# Handler to retrieve current authenticated user info
from ...auth.current_user.current_user_handler import current_user_handler

# Handler for password reset request
from ...auth.password_reset_request.password_reset_request_handler import password_reset_request_handler

# Handler for password reset confirmation
from ...auth.password_reset_confirm.password_reset_confirm_handler import password_reset_confirm_handler

# Handler for logging out a single session
from ...auth.logout.logout_handler import logout_handler

# Handler for logging out from all devices
from ...auth.logout_all.logout_all_handler import logout_all_handler

# Handler for account verification
from ...auth.verify_account.account_verification_handler import account_verification_handler

# Service for rate limiting endpoints to prevent abuse
from ...auth.security.rate_limiter_service import rate_limiter_service

# Database connection for obtaining async sessions
from ...database.connection import database

# ---------------------------- Router ----------------------------
# FastAPI router instance with "/auth" prefix and Authentication tag
router = APIRouter(prefix="/auth", tags=["Authentication"])

# ---------------------------- Signup Endpoint ----------------------------
@router.post("/signup")
@rate_limiter_service.rate_limited("signup")
async def signup(payload: SignupSchema, db: AsyncSession = Depends(database.get_session)):
    """
    Input:
        1. payload (SignupSchema): User signup details (name, email, password).
        2. db (AsyncSession): Database session dependency.

    Process:
        1. Call signup_handler to handle user registration.

    Output:
        1. JSONResponse: Response indicating signup success or failure.
    """
    return await signup_handler.handle_signup(payload.name, payload.email, payload.password, db=db)


# ---------------------------- Login Endpoint ----------------------------
@router.post("/login")
@rate_limiter_service.rate_limited("login")
async def login(payload: LoginSchema, db: AsyncSession = Depends(database.get_session)):
    """
    Input:
        1. payload (LoginSchema): User login credentials (email, password).
        2. db (AsyncSession): Database session dependency.

    Process:
        1. Call login_handler to authenticate the user and issue tokens.

    Output:
        1. JSONResponse: Response with access/refresh tokens or error message.
    """
    return await login_handler.handle_login(payload.email, payload.password, db=db)


# ---------------------------- OAuth2 Login Endpoints ----------------------------
@router.get("/oauth2/login/google")
@rate_limiter_service.rate_limited("oauth2_login")
async def oauth2_login_google():
    """
    Input:
        1. None

    Process:
        1. Initiate Google OAuth2 login via oauth2_login_handler.

    Output:
        1. JSONResponse / Redirect: Response initiating OAuth2 login flow.
    """
    return await oauth2_login_handler.handle_oauth2_login_initiate()


@router.get("/oauth2/callback/google")
@rate_limiter_service.rate_limited("oauth2_callback")
async def oauth2_callback_google(code: str, db: AsyncSession = Depends(database.get_session)):
    """
    Input:
        1. code (str): OAuth2 authorization code returned by Google.
        2. db (AsyncSession): Database session dependency.

    Process:
        1. Handle OAuth2 callback to exchange code for tokens and authenticate user.

    Output:
        1. JSONResponse: Response with login success or failure.
    """
    return await oauth2_login_handler.handle_oauth2_callback(code, db=db)


# ---------------------------- Current User Endpoint ----------------------------
@router.get("/me")
async def get_current_user(access_token: str = Cookie(None), db: AsyncSession = Depends(database.get_session)):
    """
    Input:
        1. access_token (str): Access token from cookie.
        2. db (AsyncSession): Database session dependency.

    Process:
        1. Retrieve current logged-in user info using current_user_handler.

    Output:
        1. JSONResponse: Current user details or error if not authenticated.
    """
    return await current_user_handler.get_current_user(access_token, db=db)


# ---------------------------- Logout Endpoint ----------------------------
@router.post("/logout")
@rate_limiter_service.rate_limited("logout")
async def logout(request: Request):
    """
    Input:
        1. request (Request): FastAPI request object containing cookies.

    Process:
        1. Extract refresh_token from cookies.
        2. Call logout_handler with refresh_token to revoke session.

    Output:
        1. JSONResponse: Response indicating logout success or failure.
    """
    refresh_token = request.cookies.get("refresh_token")
    return await logout_handler.handle_logout(refresh_token)


# ---------------------------- Logout All Devices Endpoint ----------------------------
@router.post("/logout/all")
@rate_limiter_service.rate_limited("logout_all")
async def logout_all(request: Request):
    """
    Input:
        1. request (Request): FastAPI request object containing cookies.

    Process:
        1. Extract refresh_token from cookies.
        2. Call logout_all_handler to revoke all sessions for the user.

    Output:
        1. JSONResponse: Response indicating logout from all devices.
    """
    refresh_token = request.cookies.get("refresh_token")
    return await logout_all_handler.handle_logout_all(refresh_token)


# ---------------------------- Password Reset Request ----------------------------
@router.post("/password-reset/request")
@rate_limiter_service.rate_limited("password_reset_request")
async def password_reset_request(payload: PasswordResetRequestSchema, db: AsyncSession = Depends(database.get_session)):
    """
    Input:
        1. payload (PasswordResetRequestSchema): Email to send password reset.
        2. db (AsyncSession): Database session dependency.

    Process:
        1. Call password_reset_request_handler to initiate password reset email.

    Output:
        1. JSONResponse: Response indicating request success or failure.
    """
    return await password_reset_request_handler.handle_password_reset_request(payload.email, db=db)


# ---------------------------- Password Reset Confirm ----------------------------
@router.post("/password-reset/confirm")
@rate_limiter_service.rate_limited("password_reset_confirm")
async def password_reset_confirm(payload: PasswordResetConfirmSchema, db: AsyncSession = Depends(database.get_session)):
    """
    Input:
        1. payload (PasswordResetConfirmSchema): Token and new password.
        2. db (AsyncSession): Database session dependency.

    Process:
        1. Call password_reset_confirm_handler to reset password using token.

    Output:
        1. JSONResponse: Response indicating password reset success or failure.
    """
    return await password_reset_confirm_handler.handle_password_reset_confirm(
        payload.token, payload.new_password, db=db
    )


# ---------------------------- Account Verification Endpoint ----------------------------
@router.get("/verify-account")
@rate_limiter_service.rate_limited("verify_account")
async def verify_account(token: str, db: AsyncSession = Depends(database.get_session)):
    """
    Input:
        1. token (str): Verification token from URL query.
        2. db (AsyncSession): Database session dependency.

    Process:
        1. Call account_verification_handler to mark user as verified.

    Output:
        1. JSONResponse: Response indicating account verification success or failure.
    """
    return await account_verification_handler.handle_account_verification(token, db=db)