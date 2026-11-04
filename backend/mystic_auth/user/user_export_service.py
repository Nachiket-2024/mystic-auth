"""CSV export of the user list: row cap, formula-injection guard, file naming."""
import csv
import io
from datetime import UTC, datetime

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import AppError
from ..core.settings import settings
from .user_crud_collector import user_crud

# CSV/formula injection guard (OWASP CSV Injection): `name` and `email` are
# both attacker-controlled (EmailStr's RFC 5322 local-part allows a leading
# "=", "+", "-", or "@", so "=1+1@example.com" is a valid, signup-able
# address). A value like "=cmd|'/c calc'!A1" is inert as CSV but runs as a
# live formula the instant someone opens the export in Excel. Prefixing a
# leading trigger character with a single quote keeps the visible value
# unchanged while forcing spreadsheets to treat it as text.
_CSV_FORMULA_TRIGGERS = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value: str) -> str:
    return f"'{value}" if value.startswith(_CSV_FORMULA_TRIGGERS) else value


def status_label(is_active: bool, deleted_at) -> str:
    """Mirrors user_base_crud._status_filter's derivation (deleted_at wins
    over is_active) so the export's status column always agrees with what
    the Status filter and UsersPage.tsx's badge would show for this row."""
    if deleted_at is not None:
        return "deleted"
    return "active" if is_active else "inactive"


async def fetch_users_for_export(db: AsyncSession, **filters):
    """Every user matching `filters`, or EXPORT_TOO_LARGE if over the row cap.

    Unlike the paginated list this has no limit/offset: it is always the
    whole filtered set, bounded by USER_EXPORT_MAX_ROWS.
    """
    total = await user_crud.count(db, **filters)
    if total > settings.USER_EXPORT_MAX_ROWS:
        raise AppError(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="EXPORT_TOO_LARGE",
            detail=f"Export matches {total} users, which exceeds the {settings.USER_EXPORT_MAX_ROWS} row limit. "
            "Narrow the filters and try again.",
        )
    return await user_crud.get_all(db, limit=max(total, 1), offset=0, **filters)


def build_users_csv(users) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "name", "email", "role", "is_verified", "is_active", "status", "created_at"])
    for user in users:
        writer.writerow([
            user.id,
            csv_safe(user.name),
            csv_safe(user.email),
            user.role.value if user.role else "",
            user.is_verified,
            user.is_active,
            status_label(user.is_active, user.deleted_at),
            user.created_at.isoformat(),
        ])
    return buffer.getvalue()


def export_filename(now: datetime | None = None) -> str:
    return f"users_export_{(now or datetime.now(UTC)).strftime('%Y%m%dT%H%M%SZ')}.csv"
