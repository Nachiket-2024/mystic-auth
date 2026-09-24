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

`resource_type`/`action` don't need to be `Permission` enum values: any non-empty string works, granted via a policy (see [Writing and Testing Policies](../authorization/writing-testing-policies.md#policy-creation-workflow)). Custom actions remain app-owned and do not need to be added to `mystic_auth/` or its catalog. The backend grant guard still applies to every action, including custom ones, so the first bootstrap grant must come from an app-owned migration/seed path; later policy creation, editing, assignment, and direct grants require the caller to already hold the actions involved. Build any custom action catalog or access picker under `backend/app/` and `frontend/src/app/`.

### Custom actions, from definition to assignment

Use this sequence when adding an application permission such as `projects:archive`.

1. Define the action in an app-owned module, for example `backend/app/access/permissions.py`. Keep the name stable and use a clear format such as `projects:archive`. If the frontend displays or selects it, define the matching value under `frontend/src/app/` too. Do not add it to `backend/mystic_auth/authorization/permissions.py` unless it is actually a MysticAuth feature.
2. Protect the application route with the same action and resource type:

   ```python
   Depends(require_authorization("projects:archive", "projects"))
   ```

   The resource type must match the policy resource type. A policy that grants `projects:archive` on `projects` does not grant it on `documents`.
3. Create the first policy through an app-owned migration or a trusted system operator. A migration is best for a repeatable deployment. A holder of the protected `system_superuser` policy may also create the first custom policy or direct grant. A caller with only `policies:create`, `policies:assign`, or `permissions:grant` cannot invent and grant an unheld custom action.
4. Assign the policy or direct grant to the first policy holder who needs it. The same backend guard applies to custom actions as to built-in actions. A caller can later create, edit, assign, or revoke a custom action only when that caller already holds the action.
5. Give non-technical policy users an app-owned screen with named permissions and explanations. MysticAuth's built-in permission catalog contains MysticAuth actions only. It does not know the names, descriptions, or business meaning of application actions. The app screen should hide actions the caller cannot grant and explain disabled actions when they are visible.

For a simple deployment, the migration can create a policy named `project_archiver` with `actions=["projects:archive"]` and `resource_type="projects"`, then assign it to the intended policy holder. For a deployment where policy users manage access themselves, seed the action and initial policy first, then let the protected system policy holder use the app's access screen for later assignments. Never ask a non-technical policy user to type raw action strings.

If a custom grant returns `403`, check three things in order: the caller holds the policy-management action needed for the endpoint, the caller already holds the exact custom action, and the policy uses the exact resource type checked by the route. The exception is the protected system policy holder, which is the intended bootstrap path.

See [Worked Example: Adding a New Domain, End to End](worked-example.md) for all of the above: model, schema, router, migration, policy, frontend page, route, and nav link, wired together for one fake domain as a copy-and-rename starting point for your first feature.

Don't need PBAC's full generality (conditions or per-resource scoping)? Use unconditioned policies with the same action/resource vocabulary; there is no separate access mechanism to learn.

---

## Replacing the frontend entirely

The backend is a stateless JSON API with no frontend-specific coupling: deleting `frontend/` and building a different client against it is supported. It expects cookie-based JWT auth (`access_token` + `refresh_token`, both httpOnly/secure/`SameSite=Strict`) from an origin matching `FRONTEND_BASE_URL`. Full route contract: [API Reference](../api/reference.md).

---

See [Using This Repository as a Template](overview.md) for the rest: quickstart, environment configuration, the ownership split, deployment, and staying in sync with upstream.

---
