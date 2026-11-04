import json
from urllib.parse import urlsplit

from starlette.types import ASGIApp, Receive, Scope, Send

from ..core.settings import settings

_UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class OriginCheckMiddleware:
    """Reject state-changing requests that a browser sent from another origin.

    SameSite=Strict cookies and the CORS allow-list already stop cross-site
    forgery, but a *same-site* sibling (another subdomain on the same
    registrable domain) is still allowed to send cookies. A browser always tells
    us where such a request came from in `Origin` (and `Sec-Fetch-Site`), so
    unsafe methods are only accepted when:

    - `Origin` is one of the configured frontend origins, or has the same
      hostname as this request's own `Host` (the page was served by this app
      through its proxy), or
    - there is no `Origin` and `Sec-Fetch-Site` is absent or `same-origin`/`none`
      (curl, server-to-server calls, tests: not a browser cross-origin request).

    Pure ASGI (not BaseHTTPMiddleware) so it never interferes with streaming
    responses such as the session-events stream.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    @staticmethod
    def _allowed_origins() -> set[str]:
        return {origin.rstrip("/").lower() for origin in settings.cors_allowed_origins}

    @staticmethod
    def _hostname(value: str) -> str | None:
        try:
            return urlsplit(value).hostname
        except ValueError:
            return None

    def _is_allowed(self, headers: dict[bytes, bytes]) -> bool:
        origin = headers.get(b"origin", b"").decode("latin-1").strip()
        fetch_site = headers.get(b"sec-fetch-site", b"").decode("latin-1").strip().lower()

        if not origin:
            return fetch_site in ("", "same-origin", "none")

        if origin.rstrip("/").lower() in self._allowed_origins():
            return True

        host = headers.get(b"host", b"").decode("latin-1").strip()
        origin_host = self._hostname(origin)
        request_host = self._hostname(f"//{host}") if host else None
        return bool(origin_host) and origin_host == request_host and fetch_site in ("", "same-origin")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in _UNSAFE_METHODS:
            await self.app(scope, receive, send)
            return

        if self._is_allowed(dict(scope["headers"])):
            await self.app(scope, receive, send)
            return

        body = json.dumps(
            {"detail": "Cross-origin request blocked.", "code": "CROSS_ORIGIN_REQUEST_BLOCKED", "params": {}}
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            }
        )
        await send({"type": "http.response.body", "body": body})
