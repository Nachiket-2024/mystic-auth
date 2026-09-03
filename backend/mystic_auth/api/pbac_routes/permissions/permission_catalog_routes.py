from fastapi import APIRouter

from ....authorization.dependencies.permission_route_dependencies import CATALOG_READ_DEPENDENCY
from ....authorization.permissions_catalog import PERMISSION_CATALOG
from ....authorization.schemas.permission_schema import PermissionCatalogEntryRead

router = APIRouter(prefix="/authorization", tags=["Authorization"])


@router.get("/permissions/catalog", response_model=list[PermissionCatalogEntryRead])
async def get_permission_catalog(current_user: dict = CATALOG_READ_DEPENDENCY):
    """The fixed, code-defined action vocabulary an admin can assign, either
    directly or bundled into a Policy (see authorization/permissions_catalog.py).
    Static and small (~20 entries), so no pagination/filter/sort: the
    frontend does that client-side.

    Gated by CATALOG_READ_DEPENDENCY (permissions:read OR policies:create OR
    policies:update), not permissions:read alone, since the Policy
    create/edit form needs this catalog too - see that dependency's
    docstring."""
    return PERMISSION_CATALOG
