import json
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import delete, func, select
from sqlalchemy.engine import CursorResult
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AttestationConveyancePreference,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from ...core.settings import settings
from ...logging.logging_config import get_logger
from ...user.user_model import User
from .passkey_model import PasskeyChallenge, PasskeyCredential

logger = get_logger(__name__)
CHALLENGE_PURPOSE_REGISTRATION = "registration"
CHALLENGE_PURPOSE_AUTHENTICATION = "authentication"
MAX_PASSKEYS_PER_USER = 10
# Values from the WebAuthn AuthenticatorTransport enum. Browsers report these
# alongside a new credential, but they are client-supplied, so only known
# values are stored.
ALLOWED_TRANSPORTS = frozenset({"usb", "nfc", "ble", "hybrid", "internal", "smart-card", "cable"})


def _clean_transports(raw: object) -> list[str]:
    """Keep only known transport names from the client-reported value."""
    if not isinstance(raw, list):
        return []
    return sorted({item for item in raw if isinstance(item, str) and item in ALLOWED_TRANSPORTS})


class PasskeyService:
    @staticmethod
    async def _new_challenge(db: AsyncSession, user_id: int | None, purpose: str, challenge: bytes) -> None:
        # Expired rows are swept by the hourly purge_expired_passkey_challenges
        # job, so this unauthenticated-reachable path is a single INSERT.
        now = datetime.now(UTC)
        db.add(
            PasskeyChallenge(
                challenge=bytes_to_base64url(challenge),
                user_id=user_id,
                purpose=purpose,
                expires_at=now + timedelta(seconds=settings.WEBAUTHN_CHALLENGE_TTL_SECONDS),
            )
        )
        await db.commit()

    @staticmethod
    async def _consume_challenge(db: AsyncSession, challenge: str, purpose: str, user_id: int | None = None):
        row = await db.scalar(
            select(PasskeyChallenge)
            .where(
                PasskeyChallenge.challenge == challenge,
                PasskeyChallenge.purpose == purpose,
                PasskeyChallenge.consumed_at.is_(None),
                PasskeyChallenge.expires_at > datetime.now(UTC),
                PasskeyChallenge.user_id == user_id if user_id is not None else PasskeyChallenge.user_id.is_(None),
            )
            .with_for_update()
        )
        if row is None:
            return None
        row.consumed_at = datetime.now(UTC)
        await db.commit()
        return row

    async def registration_options(self, user: User, db: AsyncSession) -> dict:
        credentials = (await db.scalars(select(PasskeyCredential).where(PasskeyCredential.user_id == user.id))).all()
        options = generate_registration_options(
            rp_id=settings.webauthn_rp_id,
            rp_name=settings.webauthn_rp_name,
            user_id=str(user.id).encode("utf-8"),
            user_name=user.email,
            user_display_name=user.name,
            attestation=AttestationConveyancePreference.NONE,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.REQUIRED,
            ),
            exclude_credentials=[PublicKeyCredentialDescriptor(id=c.credential_id) for c in credentials],
            timeout=60_000,
        )
        await self._new_challenge(db, user.id, CHALLENGE_PURPOSE_REGISTRATION, options.challenge)
        return json.loads(options_to_json(options))

    async def finish_registration(self, user: User, name: str, credential: dict, db: AsyncSession, origin: str):
        response = credential.get("response")
        if not isinstance(response, dict):
            return False
        challenge = response.get("clientDataJSON")
        if not isinstance(challenge, str) or not challenge:
            return False
        try:
            client_data = json.loads(base64url_to_bytes(challenge))
            expected_challenge = client_data["challenge"]
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            return False
        if not isinstance(expected_challenge, str):
            return False
        stored = await self._consume_challenge(db, expected_challenge, CHALLENGE_PURPOSE_REGISTRATION, user.id)
        if stored is None:
            return False
        try:
            result = verify_registration_response(
                credential=credential,
                expected_challenge=base64url_to_bytes(stored.challenge),
                expected_rp_id=settings.webauthn_rp_id,
                expected_origin=origin,
                require_user_verification=True,
            )
            locked_user = await db.scalar(select(User).where(User.id == user.id).with_for_update())
            if locked_user is None or not locked_user.is_active or not locked_user.is_verified:
                return False
            count = await db.scalar(
                select(func.count()).select_from(PasskeyCredential).where(PasskeyCredential.user_id == user.id)
            )
            if (count or 0) >= MAX_PASSKEYS_PER_USER:
                return False
            db.add(
                PasskeyCredential(
                    user_id=user.id,
                    credential_id=result.credential_id,
                    public_key=result.credential_public_key,
                    sign_count=result.sign_count,
                    transports=_clean_transports(response.get("transports")),
                    name=name,
                )
            )
            await db.commit()
            return True
        except IntegrityError:
            await db.rollback()
            return False
        except Exception as exc:
            await db.rollback()
            logger.info("Rejected passkey registration response: %s", type(exc).__name__)
            return False

    async def authentication_options(self, db: AsyncSession) -> dict:
        options = generate_authentication_options(
            rp_id=settings.webauthn_rp_id,
            user_verification=UserVerificationRequirement.REQUIRED,
            timeout=60_000,
        )
        await self._new_challenge(db, None, CHALLENGE_PURPOSE_AUTHENTICATION, options.challenge)
        return json.loads(options_to_json(options))

    async def finish_authentication(self, credential: dict, db: AsyncSession, origin: str):
        try:
            challenge = json.loads(base64url_to_bytes(credential["response"]["clientDataJSON"]))["challenge"]
            credential_id = base64url_to_bytes(credential["rawId"])
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            return None
        if not isinstance(challenge, str):
            return None
        stored = await self._consume_challenge(db, challenge, CHALLENGE_PURPOSE_AUTHENTICATION)
        if stored is None:
            return None
        row = await db.scalar(
            select(PasskeyCredential).where(PasskeyCredential.credential_id == credential_id).with_for_update()
        )
        if row is None:
            return None
        try:
            verification = verify_authentication_response(
                credential=credential,
                expected_challenge=base64url_to_bytes(stored.challenge),
                expected_rp_id=settings.webauthn_rp_id,
                expected_origin=origin,
                credential_public_key=row.public_key,
                credential_current_sign_count=row.sign_count,
                require_user_verification=True,
            )
        except Exception as exc:
            logger.info("Rejected passkey authentication response: %s", type(exc).__name__)
            return None
        user = await db.get(User, row.user_id)
        if not user or not user.is_active or not user.is_verified:
            return None
        user_handle = credential.get("response", {}).get("userHandle")
        try:
            handle_matches = user_handle and base64url_to_bytes(user_handle) == str(user.id).encode("utf-8")
        except (TypeError, ValueError):
            handle_matches = False
        if not handle_matches:
            return None
        row.sign_count = verification.new_sign_count
        row.last_used_at = datetime.now(UTC)
        await db.commit()
        return user

    async def list_credentials(self, user_id: int, db: AsyncSession) -> list[PasskeyCredential]:
        return list(
            (
                await db.scalars(
                    select(PasskeyCredential)
                    .where(PasskeyCredential.user_id == user_id)
                    .order_by(PasskeyCredential.created_at.desc())
                )
            ).all()
        )

    async def remove_credential(self, user_id: int, credential_pk: int, db: AsyncSession) -> bool:
        result = await db.execute(
            delete(PasskeyCredential).where(
                PasskeyCredential.user_id == user_id,
                PasskeyCredential.id == credential_pk,
            )
        )
        await db.commit()
        return cast(CursorResult, result).rowcount == 1

    async def remove_credentials(self, user_id: int, credential_pks: list[int] | None, db: AsyncSession) -> int:
        """Delete the caller's own credentials: the given ids, or all when None."""
        statement = delete(PasskeyCredential).where(PasskeyCredential.user_id == user_id)
        if credential_pks is not None:
            statement = statement.where(PasskeyCredential.id.in_(credential_pks))
        result = await db.execute(statement)
        await db.commit()
        return cast(CursorResult, result).rowcount or 0

    async def rename_credential(self, user_id: int, credential_pk: int, name: str, db: AsyncSession) -> bool:
        row = await db.scalar(
            select(PasskeyCredential)
            .where(
                PasskeyCredential.user_id == user_id,
                PasskeyCredential.id == credential_pk,
            )
            .with_for_update()
        )
        if row is None:
            return False
        row.name = name
        await db.commit()
        return True


passkey_service = PasskeyService()
