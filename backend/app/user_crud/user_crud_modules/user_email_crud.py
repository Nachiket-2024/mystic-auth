from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession


class UserEmailCRUD:
    """Email-lookup-based CRUD operations for the users table."""

    def __init__(self, model):
        self.model = model

    async def get_by_email(self, email: str, db: AsyncSession):
        result = await db.execute(select(self.model).where(self.model.email == email))
        return result.scalar_one_or_none()

    async def update_by_email(self, email: str, update_data: dict, db: AsyncSession):
        db_obj = await self.get_by_email(email, db)
        if not db_obj:
            return None

        for field, value in update_data.items():
            setattr(db_obj, field, value)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj
