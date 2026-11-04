from fastapi import HTTPException, Request, status

from ...core.settings import settings


def validated_origin(request: Request) -> str:
    """The request's Origin header, only if it is an allowed WebAuthn origin.

    The browser embeds this origin in the signed client data, and the
    verifier compares the two, so an exact allowlist here (WEBAUTHN_ORIGINS)
    is what stops a look-alike site from running a passkey ceremony.
    """
    origin = request.headers.get("origin", "")
    if origin not in settings.webauthn_origins:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid WebAuthn origin")
    return origin
