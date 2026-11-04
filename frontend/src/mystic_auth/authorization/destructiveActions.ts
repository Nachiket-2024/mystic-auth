/** Actions severe enough to flag red wherever they appear: account
 * deactivation/deletion, assigning the system role, deleting or revoking a
 * policy/permission grant, and clearing a live rate-limit counter. An explicit
 * list, not a naming heuristic, so a reversible write like `reactivate` is not
 * mis-flagged and a future destructive action is not silently missed. Full
 * "resource:action" strings (every real action is resource-prefixed), mirroring
 * PERMISSIONS in permissions.ts: update both together. */
const DESTRUCTIVE_ACTIONS = new Set([
    "users:deactivate_any",
    "users:delete_any",
    "users:assign_system_role",
    "policies:delete",
    "policies:revoke",
    "permissions:revoke",
    "rate_limits:reset",
]);

export function isDestructiveAction(action: string): boolean {
    return DESTRUCTIVE_ACTIONS.has(action);
}
