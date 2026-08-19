from fastapi import APIRouter, Depends, Query, Response, status

from ...auth.security.rate_limit_schema import RateLimitPageRead
from ...auth.security.rate_limiter_service import rate_limiter_service
from ...authorization.dependencies.authorization_dependency import require_authorization
from ...authorization.permissions import Permission

router = APIRouter(prefix="/rate-limits", tags=["Rate Limits"])

_READ_DEPENDENCY = Depends(require_authorization(Permission.RATE_LIMITS_READ.value, "rate_limits"))
_RESET_DEPENDENCY = Depends(require_authorization(Permission.RATE_LIMITS_RESET.value, "rate_limits"))


@router.get("/", response_model=RateLimitPageRead)
async def list_rate_limits(
    page: int = Query(default=1, ge=1),
    scope: str | None = Query(
        default=None,
        pattern="^(ip|account|email)$",
        # "email" is login_protection_service's login_lock:email:{email}
        # scope (see rate_limiter_service.list_active_limits and
        # RateLimitEntry.scope on the frontend) - omitting it here meant the
        # dashboard's own "Login lockout" scope filter option 422'd.
        description="Filter to only ip, account, or email limiters.",
    ),
    endpoint: str | None = Query(default=None, description="Exact match on the rate-limited endpoint name."),
    identifier: str | None = Query(default=None, description="Substring match on the IP address or account/email identifier."),
    page_size: int = Query(default=25, ge=1, le=100),
    current_user: dict = _READ_DEPENDENCY,
):
    # Bounded keyspace walk, capped at RateLimiterService.MAX_SCANNED_KEYS
    # (see list_active_limits' own docstring) - an admin-only, low-QPS page,
    # so this trades a capped read-time walk for real numbered pages instead
    # of a cursor the UI can only step through one page at a time.
    entries, total, truncated = await rate_limiter_service.list_active_limits(
        page=page, page_size=page_size, scope=scope, endpoint=endpoint, identifier=identifier
    )
    return RateLimitPageRead(entries=entries, total=total, truncated=truncated)


@router.delete("/{key:path}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_rate_limit(
    key: str,
    current_user: dict = _RESET_DEPENDENCY,
):
    """Manually clears one counter, e.g. to unblock a legitimate caller
    who tripped a limit. Idempotent (DELETE on an already-absent/expired
    key is a no-op), so this always returns 204 rather than 404."""
    await rate_limiter_service.reset_counter(key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
