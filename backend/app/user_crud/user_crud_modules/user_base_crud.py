from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession


class UserBaseCRUD:
    """Generic CRUD operations for the users table."""

    def __init__(self, model):
        self.model = model

    async def get_by_id(self, id: int, db: AsyncSession):
        result = await db.execute(select(self.model).where(self.model.id == id))
        return result.scalar_one_or_none()

    async def get_all(self, db: AsyncSession):
        result = await db.execute(select(self.model))
        return result.scalars().all()

    async def create(self, obj_data: dict, db: AsyncSession):
        obj = self.model(**obj_data)
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def update(self, db_obj, update_data: dict, db: AsyncSession):
        if not db_obj:
            return None

        for field, value in update_data.items():
            setattr(db_obj, field, value)

        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete(self, db_obj, db: AsyncSession):
        if not db_obj:
            return False

        await db.delete(db_obj)
        await db.commit()
        return True
