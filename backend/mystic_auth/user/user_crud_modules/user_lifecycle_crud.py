from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select


class UserLifecycleCRUD:
    """
    Account-lifecycle-specific CRUD operations for the users table.

    Kept separate from UserBaseCRUD.update: both operations touch exactly two
    columns (is_active, deleted_at) with app-computed values, not
    caller-supplied ones, so they shouldn't go through the generic "update
    with an arbitrary dict" entry point a profile edit uses. That dict would
    let a caller set deleted_at to anything.
    """

    def __init__(self, model):
        self.model = model

    async def soft_delete(self, db_obj, db: AsyncSession):
        """Sets is_active=False (the flag login_service.py, oauth2_service.py,
        and current_user_handler.py already gate on) and deleted_at=now."""
        if not db_obj:
            return None

        db_obj.is_active = False
        db_obj.deleted_at = datetime.now(UTC)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def reactivate(self, db_obj, db: AsyncSession):
        """Sets is_active=True and clears deleted_at. Does NOT touch policy
        assignments: the account gets back exactly what it held before
        deletion, not a silently re-granted or reset set of policies."""
        if not db_obj:
            return None

        db_obj.is_active = True
        db_obj.deleted_at = None

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_deleted_before(self, cutoff: datetime, db: AsyncSession):
        """Every soft-deleted account whose deleted_at is older than
        `cutoff`. Backs the scheduled grace-period purge job
        (procrastinate_tasks/account_purge_tasks.py), which passes
        now - settings.ACCOUNT_PURGE_GRACE_DAYS."""
        result = await db.execute(
            select(self.model).where(self.model.deleted_at.isnot(None), self.model.deleted_at < cutoff)
        )
        return result.scalars().all()
