# Building On This Template

---

*Part of [Using This Repository as a Template](overview.md). This page covers extending the frontend and backend, protecting a route with PBAC, and replacing the frontend entirely.*

## Frontend customization

Theme, pages, routing, state, and your own code under `frontend/src/app/`, plus the shared-chrome
extension points (`extraNavItems`, `extraNavbarContent`, the command palette's `extraSearchItems`,
and `AuditLogPage`'s `extraResourceTypes`/`extraActions`) that let your own routes plug into
mystic_auth/-owned UI without editing it directly. See
[Frontend Customization](frontend-customization.md) for the full details.

---

## Backend customization

- **New domain/resource**: a new top-level package under `backend/app/` (sibling to `mystic_auth/`) with its own model/schema/CRUD/router, mounted in `backend/app/main.py`, importing from `backend/app/sdk.py`. See [Backend Architecture](../architecture/backend.md#module-layout) for the shape to follow.
- **Database changes**: an Alembic migration under `backend/alembic/versions/`: no `create_all()`. See [Database Design](../database/design.md#migrations).
- **Configuration**: settings live in `backend/mystic_auth/core/settings.py`: add new ones there, re-exported from `sdk.py` as `settings`.

---

## PBAC usage

Protecting a route always goes through `require_authorization(action, resource_type)`: never a role check:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.sdk import require_authorization, Permission, database

router = APIRouter(prefix="/projects", tags=["Projects"])

@router.get("/")
async def list_all_projects(
    current_user: dict = Depends(require_authorization("projects:list_all", "projects")),
    db: AsyncSession = Depends(database.get_session)
):
    return await project_crud.get_all(db)
```

`resource_type`/`action` don't need to be `Permission` enum values: any string works, granted via a policy (see [Writing and Testing Policies](../authorization/writing-testing-policies.md#policy-creation-workflow)). Only add a `Permission` enum member if the action is sensitive enough to need the privilege-escalation guard (see [Adding New Permissions](../authorization/adding-permissions.md)).

See [Worked Example: Adding a New Domain, End to End](worked-example.md) for all of the above: model, schema, router, migration, policy, frontend page, route, and nav link, wired together for one fake domain as a copy-and-rename starting point for your first feature.

Don't need PBAC's full generality (conditions, per-resource scoping), just "everyone with role X gets these actions"? See [RBAC Quickstart](../authorization/rbac-quickstart.md): same policies, just unconditioned ones, no separate mechanism to learn.

---

## Replacing the frontend entirely

The backend is a stateless JSON API with no frontend-specific coupling: deleting `frontend/` and building a different client against it is supported. It expects cookie-based JWT auth (`access_token` + `refresh_token`, both httpOnly/secure/`SameSite=Strict`) from an origin matching `FRONTEND_BASE_URL`. Full route contract: [API Reference](../api/reference.md).

---

See [Using This Repository as a Template](overview.md) for the rest: quickstart, environment configuration, the ownership split, deployment, and staying in sync with upstream.

---
