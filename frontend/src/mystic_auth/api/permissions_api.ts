import api from "./axiosInstance";

/** Mirrors backend/mystic_auth/authorization/schemas/permission_schema.py.
 * A direct, single-action grant to a user - the granular counterpart to
 * PolicyRead (see policies_api.ts): unnamed, ad hoc, bypasses Policy. */
export interface UserPermissionRead {
    id: number;
    action: string;
    resource_type: string;
    conditions: Record<string, unknown> | null;
    is_active: boolean;
    assigned_by: string | null;
}

export interface UserPermissionsRead {
    user_email: string;
    permissions: UserPermissionRead[];
}

export interface PermissionAssignmentPayload {
    action: string;
    resource_type: string;
    conditions?: Record<string, unknown>;
}

export const grantPermissionApi = (userEmail: string, payload: PermissionAssignmentPayload) =>
    api.post(`/authorization/users/${encodeURIComponent(userEmail)}/permissions`, payload);

export const revokePermissionApi = (userEmail: string, action: string, resourceType: string) =>
    api.delete(
        `/authorization/users/${encodeURIComponent(userEmail)}/permissions/${encodeURIComponent(action)}`,
        { params: { resource_type: resourceType } }
    );

export const getMyPermissionsApi = () => api.get<UserPermissionsRead>("/authorization/users/me/permissions");

export const getUserPermissionsApi = (userEmail: string) =>
    api.get<UserPermissionsRead>(`/authorization/users/${encodeURIComponent(userEmail)}/permissions`);

/** Mirrors backend/mystic_auth/authorization/schemas/permission_schema.py's
 * PermissionCatalogEntryRead: one entry of the fixed, code-defined action
 * vocabulary (see authorization/permissions_catalog.py). */
export interface PermissionCatalogEntry {
    action: string;
    resource_type: string;
    description: string;
}

export const getPermissionCatalogApi = () =>
    api.get<PermissionCatalogEntry[]>("/authorization/permissions/catalog");
