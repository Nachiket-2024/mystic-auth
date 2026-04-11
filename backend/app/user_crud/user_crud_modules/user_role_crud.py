# ---------------------------- External Imports ----------------------------
# Import select function from SQLAlchemy for building queries
from sqlalchemy.future import select

# Import AsyncSession for type hints and async database operations
from sqlalchemy.ext.asyncio import AsyncSession

# ---------------------------- Internal Imports ----------------------------
# Import UserRole enum for role-based filtering
from ...user_table.user_model import UserRole

# ---------------------------- Role CRUD Operations ----------------------------
class UserRoleCRUD:
    """
    Role-specific CRUD operations for the single users table.

    1. get_by_role  - Fetch all users with a specific role.
    2. update_role  - Update the role of an existing user object.
    """

    # ---------------------------- Initialization ----------------------------
    def __init__(self, model):
        # Store SQLAlchemy ORM model for role-based queries
        self.model = model

    # ---------------------------- Get Records by Role ----------------------------
    async def get_by_role(self, role: UserRole, db: AsyncSession):
        """
        Input:
            1. role (UserRole): Role enum value to filter by.
            2. db (AsyncSession): Active database session.

        Process:
            1. Execute select query filtering by role column.
            2. Return all matching user records.

        Output:
            1. list: List of ORM instances with the given role.
        """
        # Step 1: Execute select query filtering by role column
        result = await db.execute(
            select(self.model).where(self.model.role == role)
        )

        # Step 2: Return all matching user records
        return result.scalars().all()

    # ---------------------------- Update Role ----------------------------
    async def update_role(self, db_obj, role: UserRole, db: AsyncSession):
        """
        Input:
            1. db_obj (object): ORM user object to update.
            2. role (UserRole): New role to assign.
            3. db (AsyncSession): Active database session.

        Process:
            1. Return None if user object does not exist.
            2. Assign new role to user object.
            3. Add updated object to session.
            4. Commit transaction to persist changes.
            5. Refresh object with DB-generated values.
            6. Return updated object.

        Output:
            1. object | None: Updated user object or None if not found.
        """
        # Step 1: Return None if user object does not exist
        if not db_obj:
            return None

        # Step 2: Assign new role to user object
        db_obj.role = role

        # Step 3: Add updated object to session
        db.add(db_obj)

        # Step 4: Commit transaction to persist changes
        await db.commit()

        # Step 5: Refresh object with DB-generated values
        await db.refresh(db_obj)

        # Step 6: Return updated object
        return db_obj