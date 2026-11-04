import pytest
from pydantic import ValidationError

from backend.mystic_auth.auth.passkeys.passkey_schema import (
    PasskeyAuthenticationFinishSchema,
    PasskeyNameSchema,
    PasskeyRegistrationFinishSchema,
)


def test_passkey_name_is_trimmed_before_handler_use():
    payload = PasskeyNameSchema(name="  Personal laptop  ")

    assert payload.normalized_name() == "Personal laptop"


def test_blank_passkey_name_is_rejected_after_normalization():
    payload = PasskeyNameSchema(name="   ")

    assert payload.normalized_name() == ""


def test_registration_finish_requires_a_credential_object():
    with pytest.raises(ValidationError):
        PasskeyRegistrationFinishSchema.model_validate(
            {"name": "Laptop", "credential": []}
        )


def test_registration_finish_rejects_oversized_credential():
    with pytest.raises(ValidationError, match="too large"):
        PasskeyRegistrationFinishSchema.model_validate(
            {"name": "Laptop", "credential": {"attestation": "x" * 100_001}}
        )


def test_authentication_finish_accepts_browser_extension_fields():
    credential = PasskeyAuthenticationFinishSchema.model_validate(
        {
            "id": "credential-id",
            "rawId": "credential-id",
            "type": "public-key",
            "response": {
                "clientDataJSON": "encoded",
                "authenticatorData": "encoded",
                "signature": "encoded",
            },
            "clientExtensionResults": {"credProps": {"rk": True}},
            "authenticatorAttachment": "platform",
        }
    )

    assert credential.model_dump()["clientExtensionResults"]["credProps"]["rk"] is True


@pytest.mark.parametrize(
    "payload",
    [
        {"rawId": "credential-id", "type": "public-key", "response": {}},
        {
            "id": "credential-id",
            "rawId": "credential-id",
            "type": "password",
            "response": {},
        },
        {
            "id": "credential-id",
            "rawId": "credential-id",
            "type": "public-key",
            "response": [],
        },
    ],
)
def test_authentication_finish_rejects_invalid_wire_shapes(payload):
    with pytest.raises(ValidationError):
        PasskeyAuthenticationFinishSchema.model_validate(payload)


def test_authentication_finish_rejects_oversized_response():
    with pytest.raises(ValidationError, match="too large"):
        PasskeyAuthenticationFinishSchema.model_validate(
            {
                "id": "credential-id",
                "rawId": "credential-id",
                "type": "public-key",
                "response": {"signature": "x" * 100_001},
            }
        )
