import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth.security.rate_limiting.rate_limiter_service import rate_limiter_service
from ...authorization.dependencies.authorization_dependency import require_authorization

# PBAC action vocabulary and policy-based authorization. Replaces the removed
# static role-permission helpers.
from ...authorization.permissions import Permission
from ...authorization.services.user_access_filter_guard import require_policy_visibility_for_access_filters
from ...core.search_query import SEARCH_QUERY_MAX_LENGTH
from ...database.connection import database
from ...user.user_crud_collector import LastLoginBucket, PermissionSource, UserStatus, user_crud
from ...user.user_export_service import build_users_csv, export_filename, fetch_users_for_export
from ...user.user_model import UserRole
from ...user.user_schema import UserRead, UserStatsRead

# Read-only management views over the whole user table, split out from
# user_management_update_routes.py (field updates) and user_lifecycle_routes.py
# (account state transitions). main.py registers this router after
# self-service routes so /{user_email} cannot shadow /users/me or /users/stats.
router = APIRouter(prefix="/users", tags=["Users"])

_RESOURCE_TYPE = "users"


@router.get("/stats", response_model=UserStatsRead)
async def get_user_stats(
    current_user: dict = Depends(require_authorization(Permission.USERS_LIST_ALL.value, _RESOURCE_TYPE)),
    db: AsyncSession = Depends(database.get_session),
):
    """Same permission as the list itself (users:list_all): this is purely
    a different view of that same data, not a separate resource. Four
    independent counts, run concurrently rather than one query each awaited
    in turn.

    Counts status="deleted" (deleted_at IS NOT NULL), not "inactive":
    deactivating a user sets is_active=False and deleted_at=now together, in
    one step (user_lifecycle_crud.py), so "inactive" (is_active=False while
    deleted_at is NULL) is a state no code path ever produces - counting it
    would always return 0. UserStatsRead's `inactive` field name is kept for
    now since it's a public API contract; it holds the deactivated-user count.
    """
    total, verified, unverified, inactive = await asyncio.gather(
        user_crud.count(db),
        user_crud.count(db, is_verified=True),
        user_crud.count(db, is_verified=False),
        user_crud.count(db, status="deleted"),
    )
    return UserStatsRead(total=total, verified=verified, unverified=unverified, inactive=inactive)


@router.get("/", response_model=list[UserRead])
async def list_all_users(
    request: Request,
    response: Response,
    # Keep the historical "all users" default for API callers. The frontend
    # passes its own explicit limit and offset.
    limit: int = Query(default=1000, ge=1, le=1000),
    offset: int = Query(default=0, ge=0, le=10_000_000),
    search: str | None = Query(
        default=None, max_length=SEARCH_QUERY_MAX_LENGTH, description="Case-insensitive substring match on name or email"
    ),
    role: UserRole | None = Query(default=None, description="Exact match on role"),
    is_verified: bool | None = Query(default=None, description="Exact match on is_verified"),
    status: UserStatus | None = Query(
        default=None, description="One of: active, inactive, deleted (see UsersPage.tsx's Status badge)"
    ),
    policy: str | None = Query(default=None, description="Exact match on the name of an assigned policy"),
    permission: Permission | None = Query(
        default=None, description="Users holding a policy whose actions include this permission"
    ),
    permission_source: PermissionSource | None = Query(
        default=None, description="When permission is set, restrict matches to policy or direct grants"
    ),
    last_login: LastLoginBucket | None = Query(
        default=None, description="Relative bucket: today, 7d, 30d, 90d, or never. Ignored if last_login_from/to are set."
    ),
    last_login_from: datetime | None = Query(default=None, description="Custom range lower bound (inclusive)"),
    last_login_to: datetime | None = Query(default=None, description="Custom range upper bound (inclusive)"),
    sort_by: str | None = Query(
        default=None,
        description="Column to sort by: name, email, role, is_verified, created_at, or last_login_at. "
        "Any other value (including unset) falls back to id.",
    ),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    current_user: dict = Depends(require_authorization(Permission.USERS_LIST_ALL.value, _RESOURCE_TYPE)),
    db: AsyncSession = Depends(database.get_session)
):
    await require_policy_visibility_for_access_filters(request, current_user, db, policy, permission, permission_source)

    # A custom range takes over from the bucket entirely once either bound is
    # set
    # doesn't fit" behavior.
    effective_last_login = None if (last_login_from or last_login_to) else last_login

    # X-Total-Count (not part of the response body, response_model stays
    # list[UserRead]) lets the frontend render numbered pages without a
    # separate round trip: computed from the same filters so the page count
    # always matches what's actually being paged through.
    total = await user_crud.count(
        db, search=search, role=role, is_verified=is_verified, status=status, policy=policy, permission=permission,
        permission_source=permission_source,
        last_login=effective_last_login, last_login_from=last_login_from, last_login_to=last_login_to,
    )
    response.headers["X-Total-Count"] = str(total)
    return await user_crud.get_all(
        db,
        limit=limit,
        offset=offset,
        search=search,
        role=role,
        is_verified=is_verified,
        status=status,
        sort_by=sort_by,
        sort_dir=sort_dir,
        policy=policy,
        permission=permission,
        permission_source=permission_source,
        last_login=effective_last_login,
        last_login_from=last_login_from,
        last_login_to=last_login_to,
    )




@router.get("/export")
# A full CSV export runs an unbounded (up to USER_EXPORT_MAX_ROWS) query and
# serialization on every call. The row cap bounds a single call's cost, but
# nothing previously bounded how often a permitted caller could repeat it -
# confirmed live: 40 back-to-back calls all succeeded with zero throttling.
# Keyed per-account like every other sensitive endpoint here, not per-IP
# only, since the caller is already authenticated.
@rate_limiter_service.rate_limited(
    "users_export", account_key_func=lambda kwargs: kwargs["current_user"]["email"], max_requests=5, window_seconds=60
)
async def export_users(
    request: Request, search: str | None = Query(
        default=None, max_length=SEARCH_QUERY_MAX_LENGTH, description="Case-insensitive substring match on name or email"
    ),
    role: UserRole | None = Query(default=None, description="Exact match on role"),
    is_verified: bool | None = Query(default=None, description="Exact match on is_verified"),
    status: UserStatus | None = Query(default=None, description="One of: active, inactive, deleted"),
    policy: str | None = Query(default=None, description="Exact match on the name of an assigned policy"),
    permission: Permission | None = Query(
        default=None, description="Users holding a policy whose actions include this permission"
    ),
    permission_source: PermissionSource | None = Query(
        default=None, description="When permission is set, restrict matches to policy or direct grants"
    ),
    last_login: LastLoginBucket | None = Query(default=None, description="Relative bucket: today, 7d, 30d, 90d, or never"),
    last_login_from: datetime | None = Query(default=None, description="Custom range lower bound (inclusive)"),
    last_login_to: datetime | None = Query(default=None, description="Custom range upper bound (inclusive)"),
    current_user: dict = Depends(require_authorization(Permission.USERS_LIST_ALL.value, _RESOURCE_TYPE)),
    db: AsyncSession = Depends(database.get_session),
):
    """CSV export of every user matching the given filters (no
    limit/offset - always the whole filtered set, unlike the paginated
    list above). Same permission as the list itself, same reasoning as
    /stats: this is just another view of that same data."""
    await require_policy_visibility_for_access_filters(request, current_user, db, policy, permission, permission_source)
    effective_last_login = None if (last_login_from or last_login_to) else last_login
    users = await fetch_users_for_export(
        db, search=search, role=role, is_verified=is_verified, status=status, policy=policy, permission=permission,
        permission_source=permission_source,
        last_login=effective_last_login, last_login_from=last_login_from, last_login_to=last_login_to,
    )
    return StreamingResponse(
        iter([build_users_csv(users)]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{export_filename()}"'},
    )
