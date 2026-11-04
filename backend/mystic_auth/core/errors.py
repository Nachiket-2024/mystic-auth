from fastapi import HTTPException


class AppError(HTTPException):
    """HTTPException with a stable machine-readable `code` (plus optional
    `params` for values like a policy name), alongside the English `detail`
    used for logs/Sentry. main.py's exception handler puts `code`/`params`
    in the JSON response so the frontend can translate the error via
    frontend/src/mystic_auth/translations/languages/*/errors.json instead of
    showing the raw `detail` string.

    `detail` is still required so call sites keep writing a real English
    sentence for logs/Sentry, same as a plain HTTPException.
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        detail: str | list | dict,
        params: dict[str, str | int] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code
        self.params = params or {}


def service_unavailable_error(detail: str = "Service temporarily unavailable") -> AppError:
    """503 with Retry-After for a failed dependency (Valkey, Postgres).

    Used instead of 401/429 so clients do not drop a valid session or tell
    the user they are rate limited when the real cause is an outage."""
    error = AppError(status_code=503, code="SERVICE_UNAVAILABLE", detail=detail)
    error.headers = {"Retry-After": "5"}
    return error
