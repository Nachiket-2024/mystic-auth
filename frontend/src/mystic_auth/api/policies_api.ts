import api from "./axiosInstance";

export interface PolicyRead {
    id: number;
    name: string;
    description: string | null;
    actions: string[];
    resource_type: string;
    conditions: Record<string, unknown> | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    created_by: string | null;
}

export interface PolicyCreatePayload {
    name: string;
    description?: string;
    actions: string[];
    resource_type: string;
    conditions?: Record<string, unknown>;
}

export interface PolicyUpdatePayload {
    name?: string;
    description?: string;
    actions?: string[];
    resource_type?: string;
    conditions?: Record<string, unknown>;
    is_active?: boolean;
    change_reason?: string;
}

export interface PolicyHistoryEntryRead {
    id: number;
    policy_id: number;
    policy_name: string;
    change_type: string;
    previous_definition: Record<string, unknown> | null;
    new_definition: Record<string, unknown> | null;
    changed_fields: string[] | null;
    changed_by: string | null;
    change_reason: string | null;
    created_at: string;
}

export interface UserPoliciesRead {
    user_email: string;
    policies: PolicyRead[];
}

export interface ListPoliciesParams {
    limit?: number;
    offset?: number;
    search?: string;
    /** Exact match, e.g. one of AUTHORIZATION_RESOURCE_TYPES. */
    resourceType?: string;
    isActive?: boolean;
    /** Column to sort by; must be one of the backend's own allowlisted
     * sortable columns (see policy_repository.py's _SORTABLE_COLUMN_NAMES) -
     * any other value is ignored server-side and falls back to id. */
    sortBy?: string;
    sortDir?: "asc" | "desc";
}

function toListPoliciesApiParams({
    limit = 1000, offset = 0, search, resourceType, isActive, sortBy, sortDir,
}: ListPoliciesParams) {
    return {
        limit, offset, search, resource_type: resourceType, is_active: isActive, sort_by: sortBy, sort_dir: sortDir,
    };
}

// X-Total-Count (total matching rows, ignoring limit/offset) rides the
// response headers rather than the body: response_model on the backend
// stays a plain list, and the header is what policyQueries.ts's paginated
// hook derives its page count from, same pattern as listUsersApi. Called
// with no params (UserPoliciesDialog's "assign a policy" dropdown wants
// every policy, not one page of them), this returns the same unfiltered,
// full list it always did.
export const listPoliciesApi = (params: ListPoliciesParams = {}) =>
    api.get<PolicyRead[]>("/authorization/policies", { params: toListPoliciesApiParams(params) });

export const getPolicyApi = (policyName: string) =>
    api.get<PolicyRead>(`/authorization/policies/${encodeURIComponent(policyName)}`);

export const createPolicyApi = (payload: PolicyCreatePayload) =>
    api.post<PolicyRead>("/authorization/policies", payload);

export const updatePolicyApi = (policyName: string, payload: PolicyUpdatePayload) =>
    api.put<PolicyRead>(`/authorization/policies/${encodeURIComponent(policyName)}`, payload);

export const deletePolicyApi = (policyName: string, reason?: string) =>
    api.delete(`/authorization/policies/${encodeURIComponent(policyName)}`, { params: { reason } });

export const getPolicyHistoryApi = (policyName: string, limit = 50, offset = 0) =>
    api.get<PolicyHistoryEntryRead[]>(`/authorization/policies/${encodeURIComponent(policyName)}/history`, {
        params: { limit, offset },
    });

export const assignPolicyApi = (userEmail: string, policyName: string) =>
    api.post(`/authorization/users/${encodeURIComponent(userEmail)}/policies`, { policy_name: policyName });

export const revokePolicyApi = (userEmail: string, policyName: string) =>
    api.delete(
        `/authorization/users/${encodeURIComponent(userEmail)}/policies/${encodeURIComponent(policyName)}`
    );

export const getMyPoliciesApi = () => api.get<UserPoliciesRead>("/authorization/users/me/policies");

export const getUserPoliciesApi = (userEmail: string) =>
    api.get<UserPoliciesRead>(`/authorization/users/${encodeURIComponent(userEmail)}/policies`);
