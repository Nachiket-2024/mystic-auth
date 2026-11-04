import { leastPrivilegeProfile } from "./authenticatedMysticAuthApiRoutes";

const matrixProfile = (name: string, permissions: string[]) => ({
  ...leastPrivilegeProfile,
  name,
  email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@example.com`,
  permissions,
});

// The distinct effective permission sets produced by the seed matrix
// (local-scripts/mystic_auth/seed-user-permission-matrix.py). Role,
// verification and active-state variants do not change the frontend permission
// projection, so each set appears once. Bundles must match the real policies
// (for example `user_management` does not grant users:delete_any or
// users:reactivate). The real-account suite is the source of truth; this list
// is only for fast mocked-route checks (dialog behavior, focus handling) that
// need no live backend. Real-account suite:
// tests/frontend/mystic_auth/e2e/authorization/permission_matrix_real_accounts_browser.spec.ts.
export const matrixPermissionProfiles = [
  matrixProfile("matrix-none", ["users:read_own", "users:update_own"]),
  matrixProfile("matrix-list-direct", ["users:read_own", "users:update_own", "users:list_all"]),
  matrixProfile("matrix-user-management", [
    "users:read_own", "users:update_own", "users:list_all", "users:update_any",
    "users:deactivate_any", "users:assign_role",
  ]),
  matrixProfile("matrix-policy-reader", ["users:read_own", "users:update_own", "policies:read"]),
  matrixProfile("matrix-policy-management", [
    "users:read_own", "users:update_own", "policies:read", "policies:create",
    "policies:update", "policies:delete", "policies:assign", "policies:revoke",
    "rate_limits:read", "rate_limits:reset",
  ]),
  matrixProfile("matrix-permission-reader", ["users:read_own", "users:update_own", "permissions:read"]),
  matrixProfile("matrix-rate-limit-management", [
    "users:read_own", "users:update_own", "rate_limits:read", "rate_limits:reset",
  ]),
  matrixProfile("matrix-security-auditor", ["users:read_own", "users:update_own", "security_audit:read"]),
  matrixProfile("matrix-direct-policy-reader", [
    "users:read_own", "users:update_own", "users:list_all", "policies:read",
  ]),
];
