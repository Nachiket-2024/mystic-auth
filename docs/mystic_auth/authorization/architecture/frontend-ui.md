# PBAC Architecture: Frontend Policy Management UI

---

## Frontend Policy Management UI

The admin-facing policy screens live under `frontend/src/mystic_auth/policies/` and `frontend/src/mystic_auth/users/`, routed at `/policies` (gated by `policies:read`):

| File | Role |
|---|---|
| `policies/PoliciesPage.tsx` | List/search policies, activate/deactivate, delete; every action gated by `IfCan` against the matching permission (`policies:create`/`update`/`delete`) |
| `policies/PolicyFormDialog.tsx` | Create/edit form, including the raw `conditions` JSON block described in [Condition Schema Reference](../condition-schema-reference.md) |
| `policies/PolicyDetailsDialog.tsx` | Read-only view of a policy's actions, resource type, and conditions |
| `policies/PolicyStatsCard.tsx` | Summary counts (active/inactive policies, total assignments) on the Policies page |
| `permissions/PermissionsPage.tsx` | Read-only, searchable/filterable/sortable list of the fixed action vocabulary, routed at `/permissions` (gated by `permissions:read`), fetched once from `GET /authorization/permissions/catalog` and paged client-side |
| `policies/dialogs/ActionsMultiSelect.tsx` | Multi-select for `PolicyFormDialog`'s `actions` field, scoped to whichever `resource_type` is currently selected so a policy can't be given an action that resource_type will never actually match |
| `users/dialogs/UserPoliciesDialog.tsx` | Assign/revoke policies for a specific user, calling `POST`/`DELETE /authorization/users/{email}/policies`. The "assign a policy" dropdown excludes any candidate policy that would add nothing new - see `policies/logic/effectiveGrants.ts` below |
| `users/dialogs/UserPermissionsDialog.tsx` | Grant/revoke direct permission grants for a specific user, including the raw `conditions` JSON block, calling `POST`/`DELETE /authorization/users/{email}/permissions`. The "grant a permission" dropdown excludes any catalog action already covered by an assigned policy or an existing direct grant |
| `policies/logic/effectiveGrants.ts` | Shared helper for the two dialogs above: fans a user's assigned policies out across each policy's own `actions`/`resource_type`, unions that with their direct `UserPermission` grants, and exposes `policyAddsNothingNew()` to test a candidate policy against that combined set. This is a UI-only convenience filter, not an authorization decision - the actual grant-guard still runs server-side via `assert_authorized_to_grant` regardless of what the dropdown offers |
| `users/bulk/BulkActionToolbar.tsx` | Always rendered above the Users table; its assign-policy/grant-permission/set-role/clear-selection buttons are disabled (not hidden) until 1+ users are selected via the table's checkboxes. Does not apply `effectiveGrants.ts`'s overlap filtering - a shared dropdown across multiple, possibly differently-provisioned users has no single well-defined "already has it" answer |
| `users/bulk/BulkPolicyAssignDialog.tsx`, `BulkPermissionGrantDialog.tsx`, `BulkRoleAssignDialog.tsx` | One dialog per bulk operation, each calling its `/authorization/bulk/...` endpoint and rendering per-item results via `BulkOperationResultList.tsx` (same `users/bulk/` folder) |
| `api/policies_api.ts` | Typed client for the single-user policy routes |
| `api/permissions_api.ts` | Typed client for the single-user direct-permission routes and the permission catalog (`GET /authorization/permissions/catalog`) |
| `api/bulkAssignment_api.ts` | Typed client for the bulk policy/permission/role routes |

The UI is a thin client over the routes above: it does not duplicate the grant-guard or condition logic. `assert_authorized_to_grant` (see [Component Responsibilities: Authorization Service](component-responsibilities.md#authorization-service)) still runs server-side on every create/update/assign, so the form does not need to (and does not) replicate that check.

---

### Dropdown filtering in the single-user dialogs

`UserPoliciesDialog.tsx` and `UserPermissionsDialog.tsx` both need the same answer to "what's actually new to offer this user", combining two independent grant sources (assigned policies and direct permission grants) before comparing against the full catalog:

```mermaid
%%{init: {"themeVariables": {"lineColor": "#334155"}} }%%
flowchart TD
    Open["Dialog opens for one user"]
    Policies["Assigned policies\n useUserPoliciesQuery"]
    Grants["Direct permission grants\n useUserPermissionsQuery"]
    Build["Effective grant key set\n action/resource_type pairs\n effectiveGrants.ts"]
    Catalog["Full policy list /\n permission catalog"]
    Check{"Candidate adds an\n action outside the\n effective set?"}
    Offer["Offered in dropdown"]
    Skip["Excluded"]
    Open --> Policies --> Build
    Open --> Grants --> Build
    Catalog --> Check
    Build --> Check
    Check -- "yes" --> Offer
    Check -- "no, fully covered already" --> Skip
    classDef success fill:#dcfce7,stroke:#16a34a,color:#14532d
    classDef blocked fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    classDef decision fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a
    class Offer success
    class Skip blocked
    class Check decision
    linkStyle default stroke:#334155,stroke-width:2px
```

---

A candidate that grants even one action outside the effective set stays offered, even if it partially overlaps an existing grant - only a candidate that would add nothing new gets excluded. This filtering is a UI convenience only; it has no bearing on what the server ultimately allows or rejects.

---

See [PBAC Architecture](README.md) for the request flow.

---
