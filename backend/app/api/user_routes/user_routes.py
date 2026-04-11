# ---------------------------- External Imports ----------------------------
# Import FastAPI router, dependency injection, HTTP exceptions, and cookie support
from fastapi import APIRouter, Depends, HTTPException, status, Cookie

# Import Async SQLAlchemy session for async database operations
from sqlalchemy.ext.asyncio import AsyncSession

# ---------------------------- Internal Imports ----------------------------
# Single user CRUD instance for querying the unified users table
from ...user_crud.user_crud_collector import user_crud

# UserRole enum for role validation in dependencies
from ...user_table.user_model import UserRole

# User schemas for request validation and response shaping
from ...user_table.user_schema import UserRead, UserUpdate, UserRoleUpdate

# Current user handler for extracting authenticated user from token
from ...auth.current_user.current_user_handler import current_user_handler

# Database connection abstraction to get async sessions
from ...database.connection import database

# ---------------------------- Router Setup ----------------------------
# Create a new API router for user-related endpoints
router = APIRouter(
    prefix="/users",  # Base path for all routes in this router
    tags=["Users"]    # Tag for API docs grouping
)

# ---------------------------- Auth Dependencies ----------------------------
async def get_current_user(
    access_token: str = Cookie(None),
    db: AsyncSession = Depends(database.get_session)
) -> dict:
    """
    Reusable dependency that returns the current authenticated user dict.
    Raises 401 if token is missing or invalid.
    """
    return await current_user_handler.get_current_user(access_token, db)


async def require_admin(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """
    Reusable dependency that enforces admin-or-above access.
    Both admin and system roles are permitted — system is a superset of admin.
    Raises 403 if the current user is neither admin nor system.
    """
    # Allow both admin and system roles — system inherits all admin privileges
    if current_user["role"] not in (UserRole.admin.value, UserRole.system.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user


async def require_system(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """
    Reusable dependency that enforces system-only access.
    Only the system superuser can pass this dependency.
    Raises 403 if the current user is not the system superuser.
    """
    # Only system role is permitted past this dependency
    if current_user["role"] != UserRole.system.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System superuser privileges required"
        )
    return current_user


# ---------------------------- Get Own Profile ----------------------------
@router.get("/me", response_model=UserRead)
async def get_my_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_session)
):
    """
    Input:
        1. current_user (dict): Authenticated user from token.
        2. db (AsyncSession): Async database session.

    Process:
        1. Extract email from current user.
        2. Fetch full user record from unified users table.

    Output:
        1. UserRead: User's profile information.
    """
    # Step 1: Extract email from current user
    email = current_user["email"]

    # Step 2: Fetch full user record from unified users table
    user = await user_crud.get_by_email(email, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return user


# ---------------------------- Update Own Profile ----------------------------
@router.put("/me", response_model=UserRead)
async def update_my_profile(
    update_data: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(database.get_session)
):
    """
    Input:
        1. update_data (UserUpdate): Fields to update for the user.
        2. current_user (dict): Authenticated user from token.
        3. db (AsyncSession): Async database session.

    Process:
        1. Extract email from current user.
        2. Fetch current user record.
        3. Apply updates — exclude unset fields to avoid overwriting with None.

    Output:
        1. UserRead: Updated user object.
    """
    # Step 1: Extract email from current user
    email = current_user["email"]

    # Step 2: Fetch current user record
    user = await user_crud.get_by_email(email, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Step 3: Apply updates — exclude unset fields to avoid overwriting with None
    return await user_crud.update(
        db_obj=user,
        update_data=update_data.model_dump(exclude_unset=True),
        db=db
    )


# ---------------------------- List All Users (Admin and above) ----------------------------
@router.get("/", response_model=list[UserRead])
async def list_all_users(
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(database.get_session)
):
    """
    Input:
        1. current_user (dict): Authenticated admin or system user from token.
        2. db (AsyncSession): Async database session.

    Process:
        1. Fetch all users from the unified users table.

    Output:
        1. list[UserRead]: All user records.
    """
    # Fetch all users from the unified users table
    return await user_crud.get_all(db)


# ---------------------------- Update Any User (Admin and above) ----------------------------
@router.put("/{user_email}", response_model=UserRead)
async def update_any_user(
    user_email: str,
    update_data: UserUpdate,
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(database.get_session)
):
    """
    Input:
        1. user_email (str): Email of the user to update.
        2. update_data (UserUpdate): Fields to update.
        3. current_user (dict): Authenticated admin or system user from token.
        4. db (AsyncSession): Async database session.

    Process:
        1. Fetch target user from unified users table.
        2. Apply updates to user's record.

    Output:
        1. UserRead: Updated user object.
    """
    # Step 1: Fetch target user from unified users table
    user = await user_crud.get_by_email(user_email, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Step 2: Apply updates to user's record
    return await user_crud.update(
        db_obj=user,
        update_data=update_data.model_dump(exclude_unset=True),
        db=db
    )


# ---------------------------- Delete Any User (Admin and above) ----------------------------
@router.delete("/{user_email}")
async def delete_any_user(
    user_email: str,
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(database.get_session)
):
    """
    Input:
        1. user_email (str): Email of the user to delete.
        2. current_user (dict): Authenticated admin or system user from token.
        3. db (AsyncSession): Async database session.

    Process:
        1. Fetch target user from unified users table.
        2. Guard against deleting a system user.
        3. Delete user record.

    Output:
        1. dict: Confirmation message of deletion.
    """
    # Step 1: Fetch target user from unified users table
    user = await user_crud.get_by_email(user_email, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Step 2: Guard against deleting the system user
    if user.role == UserRole.system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System user cannot be deleted"
        )

    # Step 3: Delete user record
    await user_crud.delete(db_obj=user, db=db)
    return {"detail": f"User {user_email} deleted successfully"}


# ---------------------------- Update User Role (Admin and above) ----------------------------
@router.patch("/{user_email}/role")
async def update_user_role(
    user_email: str,
    role_data: UserRoleUpdate,
    current_user: dict = Depends(require_admin),
    db: AsyncSession = Depends(database.get_session)
):
    """
    Input:
        1. user_email (str): Email of the user whose role to change.
        2. role_data (UserRoleUpdate): New role to assign.
        3. current_user (dict): Authenticated admin or system user from token.
        4. db (AsyncSession): Async database session.

    Process:
        1. Fetch target user from unified users table.
        2. Guard against modifying the system user's role.
        3. Guard against admin assigning the system role.
        4. Update role column directly on the user record.

    Output:
        1. dict: Confirmation message of role change.
    """
    # Step 1: Fetch target user from unified users table
    user = await user_crud.get_by_email(user_email, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Step 2: Guard against modifying the system user's role
    if user.role == UserRole.system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System user role cannot be changed"
        )

    # Step 3: Guard against admin assigning the system role to anyone
    if role_data.role == UserRole.system and current_user["role"] != UserRole.system.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only system superuser can assign the system role"
        )

    # Step 4: Update role column directly on the user record
    await user_crud.update_role(db_obj=user, role=role_data.role, db=db)
    return {"detail": f"User {user_email} role updated to {role_data.role.value}"}


# ---------------------------- Promote to Admin (System only) ----------------------------
@router.patch("/{user_email}/promote-to-admin")
async def promote_to_admin(
    user_email: str,
    current_user: dict = Depends(require_system),
    db: AsyncSession = Depends(database.get_session)
):
    """
    Input:
        1. user_email (str): Email of the user to promote.
        2. current_user (dict): Authenticated system superuser from token.
        3. db (AsyncSession): Async database session.

    Process:
        1. Fetch target user from unified users table.
        2. Guard against promoting a system user.
        3. Guard against promoting an already-admin user.
        4. Promote user to admin role.

    Output:
        1. dict: Confirmation message of promotion.
    """
    # Step 1: Fetch target user from unified users table
    user = await user_crud.get_by_email(user_email, db)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Step 2: Guard against promoting a system user
    if user.role == UserRole.system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change role of a system user"
        )

    # Step 3: Guard against promoting an already-admin user
    if user.role == UserRole.admin:
        return {"detail": f"{user_email} is already an admin"}

    # Step 4: Promote user to admin role
    await user_crud.update_role(db_obj=user, role=UserRole.admin, db=db)
    return {"detail": f"{user_email} promoted to admin successfully"}