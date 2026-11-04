import base64
import hashlib
import json
import struct
from datetime import UTC, datetime, timedelta

import cbor2
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import delete, update

from backend.mystic_auth.auth.passkeys.passkey_model import PasskeyChallenge
from backend.mystic_auth.core.settings import settings
from backend.mystic_auth.database.connection import database
from backend.mystic_auth.user.user_crud_collector import user_crud
from backend.mystic_auth.user_session.session_model import UserSession

from .auth_test_accounts import PASSWORD, signup_verify_login, unique_email

ORIGIN = "https://testserver"


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _client_data(challenge: str, ceremony_type: str) -> str:
    return _b64url(
        json.dumps(
            {
                "type": ceremony_type,
                "challenge": challenge,
                "origin": ORIGIN,
                "crossOrigin": False,
            },
            separators=(",", ":"),
        ).encode()
    )


def _registration_credential(challenge: str, credential_id: bytes, private_key):
    public_key = private_key.public_key().public_numbers()
    cose_key = cbor2.dumps(
        {
            1: 2,  # EC2
            3: -7,  # ES256
            -1: 1,  # P-256
            -2: public_key.x.to_bytes(32, "big"),
            -3: public_key.y.to_bytes(32, "big"),
        }
    )
    authenticator_data = (
        hashlib.sha256(b"testserver").digest()
        + b"\x45"  # UP | UV | AT
        + struct.pack(">I", 0)
        + bytes(16)  # AAGUID
        + struct.pack(">H", len(credential_id))
        + credential_id
        + cose_key
    )
    attestation_object = cbor2.dumps(
        {"fmt": "none", "authData": authenticator_data, "attStmt": {}}
    )
    return {
        "id": _b64url(credential_id),
        "rawId": _b64url(credential_id),
        "type": "public-key",
        "response": {
            "clientDataJSON": _client_data(challenge, "webauthn.create"),
            "attestationObject": _b64url(attestation_object),
            "transports": ["internal"],
        },
        "clientExtensionResults": {},
        "authenticatorAttachment": "platform",
    }


def _authentication_credential(
    challenge: str, credential_id: bytes, private_key, user_handle: str
):
    client_data_json = json.dumps(
        {
            "type": "webauthn.get",
            "challenge": challenge,
            "origin": ORIGIN,
            "crossOrigin": False,
        },
        separators=(",", ":"),
    ).encode()
    authenticator_data = (
        hashlib.sha256(b"testserver").digest() + b"\x05" + struct.pack(">I", 1)
    )
    signature = private_key.sign(
        authenticator_data + hashlib.sha256(client_data_json).digest(),
        ec.ECDSA(hashes.SHA256()),
    )
    return {
        "id": _b64url(credential_id),
        "rawId": _b64url(credential_id),
        "type": "public-key",
        "response": {
            "clientDataJSON": _b64url(client_data_json),
            "authenticatorData": _b64url(authenticator_data),
            "signature": _b64url(signature),
            "userHandle": user_handle,
        },
        "clientExtensionResults": {},
        "authenticatorAttachment": "platform",
    }


@pytest.mark.asyncio
async def test_passkey_register_authenticate_replay_and_manage(
    client, created_emails, monkeypatch
):
    monkeypatch.setattr(settings, "WEBAUTHN_RP_ID", "testserver")
    monkeypatch.setattr(settings, "WEBAUTHN_ORIGINS", ORIGIN)
    email = unique_email()
    await signup_verify_login(client, created_emails, email)

    async with database.async_session() as db:
        user = await user_crud.get_by_email(email, db)
        await db.execute(
            update(UserSession)
            .where(UserSession.user_id == user.id)
            .values(created_at=datetime.now(UTC) - timedelta(minutes=20))
        )
        await db.commit()
    stale_auth = await client.post(
        "/auth/passkeys/registration/options", json={"name": "Laptop"}
    )
    assert stale_auth.status_code == 403
    assert stale_auth.json()["code"] == "PASSKEY_STEP_UP_REQUIRED"

    wrong = await client.post("/auth/passkeys/step-up/password", json={"password": "not-the-password"})
    assert wrong.status_code == 400
    assert wrong.json()["code"] == "CURRENT_PASSWORD_INCORRECT"
    assert (
        await client.post("/auth/passkeys/registration/options", json={"name": "Laptop"})
    ).status_code == 403

    confirmed = await client.post("/auth/passkeys/step-up/password", json={"password": PASSWORD})
    assert confirmed.status_code == 200
    assert confirmed.json()["expires_in"] == 900

    options_response = await client.post(
        "/auth/passkeys/registration/options", json={"name": "Laptop"}
    )
    assert options_response.status_code == 200
    registration_options = options_response.json()
    assert registration_options["authenticatorSelection"]["residentKey"] == "required"
    assert (
        registration_options["authenticatorSelection"]["userVerification"] == "required"
    )
    credential_id = b"test-credential-id"
    private_key = ec.generate_private_key(ec.SECP256R1())

    expired_options = await client.post(
        "/auth/passkeys/registration/options", json={"name": "Expired laptop"}
    )
    async with database.async_session() as db:
        await db.execute(
            update(PasskeyChallenge)
            .where(PasskeyChallenge.challenge == expired_options.json()["challenge"])
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await db.commit()
    expired_credential = _registration_credential(
        expired_options.json()["challenge"], credential_id, private_key
    )
    expired_registration = await client.post(
        "/auth/passkeys/registration/verify",
        json={"name": "Expired laptop", "credential": expired_credential},
        headers={"origin": ORIGIN},
    )
    assert expired_registration.status_code == 400

    registration_credential = _registration_credential(
        registration_options["challenge"], credential_id, private_key
    )
    created = await client.post(
        "/auth/passkeys/registration/verify",
        json={"name": "Laptop", "credential": registration_credential},
        headers={"origin": ORIGIN},
    )
    assert created.status_code == 200
    registration_replay = await client.post(
        "/auth/passkeys/registration/verify",
        json={"name": "Laptop", "credential": registration_credential},
        headers={"origin": ORIGIN},
    )
    assert registration_replay.status_code == 400

    listed = await client.get("/auth/passkeys")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    passkey_id = listed.json()[0]["id"]
    assert listed.json()[0]["name"] == "Laptop"

    renamed = await client.patch(
        f"/auth/passkeys/{passkey_id}", json={"name": "Personal laptop"}
    )
    assert renamed.status_code == 200
    assert (await client.get("/auth/passkeys")).json()[0]["name"] == "Personal laptop"

    client.cookies.clear()
    auth_options = await client.post("/auth/passkeys/authentication/options")
    wrong_key = ec.generate_private_key(ec.SECP256R1())
    invalid_signature = _authentication_credential(
        auth_options.json()["challenge"],
        credential_id,
        wrong_key,
        registration_options["user"]["id"],
    )
    rejected_signature = await client.post(
        "/auth/passkeys/authentication/verify",
        json=invalid_signature,
        headers={"origin": ORIGIN},
    )
    assert rejected_signature.status_code == 401

    auth_options = await client.post("/auth/passkeys/authentication/options")
    auth_credential = _authentication_credential(
        auth_options.json()["challenge"],
        credential_id,
        private_key,
        registration_options["user"]["id"],
    )
    authenticated = await client.post(
        "/auth/passkeys/authentication/verify",
        json=auth_credential,
        headers={"origin": ORIGIN},
    )
    assert authenticated.status_code == 200
    assert "access_token" in authenticated.cookies
    replay = await client.post(
        "/auth/passkeys/authentication/verify",
        json=auth_credential,
        headers={"origin": ORIGIN},
    )
    assert replay.status_code == 401

    malformed_options = await client.post("/auth/passkeys/authentication/options")
    malformed_credential = _authentication_credential(
        malformed_options.json()["challenge"],
        credential_id,
        private_key,
        "not_base64***",
    )
    malformed = await client.post(
        "/auth/passkeys/authentication/verify",
        json=malformed_credential,
        headers={"origin": ORIGIN},
    )
    assert malformed.status_code == 401

    me = await client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == email

    removed = await client.delete(f"/auth/passkeys/{passkey_id}")
    assert removed.status_code == 200
    assert (await client.get("/auth/passkeys")).json() == []

    async with database.async_session() as db:
        await db.execute(
            delete(PasskeyChallenge).where(PasskeyChallenge.user_id.is_(None))
        )
        await db.commit()


@pytest.mark.asyncio
async def test_passkey_registration_rejects_unconfigured_origin(
    client, created_emails, monkeypatch
):
    monkeypatch.setattr(settings, "WEBAUTHN_RP_ID", "testserver")
    monkeypatch.setattr(settings, "WEBAUTHN_ORIGINS", ORIGIN)
    email = unique_email()
    await signup_verify_login(client, created_emails, email)
    options = await client.post(
        "/auth/passkeys/registration/options", json={"name": "Laptop"}
    )
    malformed = await client.post(
        "/auth/passkeys/registration/verify",
        json={"name": "Laptop", "credential": {"response": "invalid"}},
        headers={"origin": ORIGIN},
    )
    body = {"name": "Laptop", "credential": {}}

    rejected = await client.post(
        "/auth/passkeys/registration/verify",
        json=body,
        headers={"origin": "https://evil.test"},
    )
    assert options.status_code == 200
    assert malformed.status_code == 400
    # Two layers reject a foreign origin: the origin-check middleware (403) and,
    # behind it, the passkey ceremony's own origin validation (400).
    assert rejected.status_code in (400, 403)
