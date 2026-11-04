import traceback
from urllib.parse import quote

from fastapi import Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...audit_log.audit_log_service import PASSKEY_STEP_UP_FAILURE, log_security_event
from ...core.settings import settings
from ...logging.logging_config import get_logger
from ...user.user_crud_collector import user_crud
from ..current_user.current_user_handler import current_user_handler
from ..oauth2.oauth2_service import OAUTH2_STATE_TTL_SECONDS, oauth2_service
from .passkey_step_up_handler import passkey_step_up_handler

logger = get_logger(__name__)


class PasskeyGoogleStepUpHandler:
    """Google re-authentication that unlocks passkey changes, for accounts with
    no password. A normal OAuth2 round trip, except the stored state carries a
    step-up context, so the shared callback hands the result here instead of
    logging anyone in. Flow and security notes: docs/mystic_auth/authentication/passkeys.md."""

    @staticmethod
    def return_to_passkeys(result: str) -> RedirectResponse:
        """Back to the Passkeys tab. `result` is "ok" or an error code the frontend translates."""
        response = RedirectResponse(url=f"{settings.FRONTEND_BASE_URL}/account-settings?tab=passkeys&stepup={result}")
        response.delete_cookie("oauth_state", httponly=True, secure=settings.secure_cookies, samesite="lax")
        return response

    async def initiate(self, access_token: str | None, db: AsyncSession) -> RedirectResponse:
        """`prompt=login` makes Google ask again even if its own session is
        still warm, so this is a real re-check and not a silent redirect."""
        try:
            if not access_token:
                return self.return_to_passkeys("PASSKEY_STEP_UP_FAILED")
            current = await current_user_handler.get_current_user(access_token, db=db)
            context = await passkey_step_up_handler.google_step_up_context(current["email"], access_token, db)
            state, code_challenge = await oauth2_service.generate_and_store_state(step_up_context=context)
            hint = quote(context["email"], safe="")
            response = RedirectResponse(
                url=oauth2_service.build_authorization_url(state, code_challenge, f"&prompt=login&login_hint={hint}")
            )
            # Lax, not Strict: the cookie must survive Google's cross-site redirect back to the callback.
            response.set_cookie(
                key="oauth_state",
                value=state,
                httponly=True,
                secure=settings.secure_cookies,
                samesite="lax",
                max_age=OAUTH2_STATE_TTL_SECONDS,
            )
            return response
        except Exception:
            logger.info("Google step-up could not start:\n%s", traceback.format_exc())
            return self.return_to_passkeys("PASSKEY_STEP_UP_FAILED")

    async def handle_callback(
        self, context: dict[str, str], code: str, code_verifier: str, db: AsyncSession | None, request: Request | None
    ) -> RedirectResponse:
        try:
            if db is None or request is None:
                return self.return_to_passkeys("PASSKEY_STEP_UP_FAILED")
            token_data = await oauth2_service.exchange_code_for_tokens(
                code,
                client_id=settings.GOOGLE_CLIENT_ID,
                client_secret=settings.GOOGLE_CLIENT_SECRET,
                redirect_uri=settings.GOOGLE_REDIRECT_URI,
                code_verifier=code_verifier,
            )
            if not token_data or "access_token" not in token_data:
                return self.return_to_passkeys("OAUTH_LOGIN_FAILED")
            user_info = await oauth2_service.get_user_info(token_data["access_token"])
            if not user_info or "email" not in user_info:
                return self.return_to_passkeys("OAUTH_LOGIN_FAILED")
            if not user_info.get("email_verified"):
                return self.return_to_passkeys("OAUTH_EMAIL_NOT_VERIFIED")

            user = await user_crud.get_by_email(context["email"], db)
            same_account = user_info["email"].strip().casefold() == context["email"].strip().casefold()
            if user is None or not user.is_active or not same_account:
                await log_security_event(
                    PASSKEY_STEP_UP_FAILURE,
                    db,
                    user_email=context["email"],
                    success=False,
                    request=request,
                    metadata={"method": "google"},
                )
                return self.return_to_passkeys("PASSKEY_STEP_UP_FAILED")

            await passkey_step_up_handler.record_step_up(context["chain"], user, "google", request, db)
            return self.return_to_passkeys("ok")
        except Exception:
            logger.error("Error handling Google step-up callback:\n%s", traceback.format_exc())
            return self.return_to_passkeys("PASSKEY_STEP_UP_FAILED")


passkey_google_step_up_handler = PasskeyGoogleStepUpHandler()
