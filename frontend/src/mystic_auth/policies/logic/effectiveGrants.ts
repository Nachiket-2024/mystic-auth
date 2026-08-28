import type { PolicyRead } from "../../api/policies_api";

// Mirrors backend's policy_evaluator.py: a policy/grant's resource_type of
// "*" matches any resource type, not the literal string "*" - see
// policy_model.py's own field comment ("*" matches any resource type).
const WILDCARD_RESOURCE_TYPE = "*";

/** A single (action, resource_type) pair, the unit both a Policy's
 * `actions` (fanned out against its one `resource_type`) and a direct
 * UserPermission grant ultimately resolve to when actually authorizing a
 * request (see backend's AuthorizationService._get_effective_policies,
 * which normalizes both into the same shape before evaluating). */
export function grantKey(action: string, resourceType: string): string {
    return `${action}::${resourceType}`;
}

/**
 * Every (action, resource_type) a user already effectively holds, from
 * BOTH of their two independent grant sources: policies currently assigned
 * to them (fanned out across each policy's own `actions`/`resource_type`)
 * and direct UserPermission grants. Used to decide what's actually new to
 * offer in the "assign a policy"/"grant a permission" dropdowns - a flat
 * "is this exact policy name/action already there" check misses the case
 * where a *different* policy (or a direct grant) already covers the same
 * ground.
 */
export function buildEffectiveGrantKeySet(
    assignedPolicies: Pick<PolicyRead, "actions" | "resource_type">[],
    directGrants: { action: string; resource_type: string }[]
): Set<string> {
    const keys = new Set<string>();
    for (const policy of assignedPolicies) {
        for (const action of policy.actions) {
            keys.add(grantKey(action, policy.resource_type));
        }
    }
    for (const grant of directGrants) {
        keys.add(grantKey(grant.action, grant.resource_type));
    }
    return keys;
}

/** True if the user already effectively holds `action` on `resourceType`,
 * per `effectiveGrantKeys` (see buildEffectiveGrantKeySet). Checks the
 * exact (action, resource_type) pair AND whether the user holds that same
 * action with a wildcard resource_type ("*") - e.g. a "system_superuser"
 * policy granting "policies:read" on "*" already covers "policies:read" on
 * "policies" from some other policy, even though the two pairs are
 * literally different strings. Not symmetric: already holding the action
 * on one specific resource_type does NOT cover a candidate that itself
 * asks for "*" (that specific grant doesn't reach every OTHER resource
 * type the wildcard would). */
function hasEffectiveGrant(effectiveGrantKeys: Set<string>, action: string, resourceType: string): boolean {
    return (
        effectiveGrantKeys.has(grantKey(action, resourceType)) ||
        effectiveGrantKeys.has(grantKey(action, WILDCARD_RESOURCE_TYPE))
    );
}

/** True if every one of `candidate`'s own (action, resource_type) pairs is
 * already in `effectiveGrantKeys` - i.e. assigning it would add nothing the
 * user doesn't already effectively have some other way (an exact repeat, a
 * subset of an already-assigned policy, or fully covered by direct
 * grants). A policy that grants even one action outside that set still
 * adds real value and should stay offered. */
export function policyAddsNothingNew(
    candidate: Pick<PolicyRead, "actions" | "resource_type">,
    effectiveGrantKeys: Set<string>
): boolean {
    return candidate.actions.every((action) => hasEffectiveGrant(effectiveGrantKeys, action, candidate.resource_type));
}

/** Every (action, resource_type) pair a user effectively holds, deduped
 * across BOTH grant sources (fanned-out assigned policies and direct
 * grants) - the display counterpart to buildEffectiveGrantKeySet, for
 * UserDetailsDialog's "full effective permissions" list rather than a
 * membership-only Set. Two different policies (or a policy and a direct
 * grant) contributing the identical (action, resource_type) pair collapse
 * to one entry here, same as they collapse to one key there. */
export function buildEffectivePermissionList(
    assignedPolicies: Pick<PolicyRead, "actions" | "resource_type">[],
    directGrants: { action: string; resource_type: string }[]
): { action: string; resource_type: string }[] {
    const byKey = new Map<string, { action: string; resource_type: string }>();
    for (const policy of assignedPolicies) {
        for (const action of policy.actions) {
            byKey.set(grantKey(action, policy.resource_type), { action, resource_type: policy.resource_type });
        }
    }
    for (const grant of directGrants) {
        byKey.set(grantKey(grant.action, grant.resource_type), { action: grant.action, resource_type: grant.resource_type });
    }
    return [...byKey.values()];
}

/** Drops any (action, resource_type) pair in `grants` whose action already
 * has a wildcard ("*") entry in `wildcardSource` (defaults to `grants`
 * itself) - a specific "policies:read" badge next to a "policies:read" on
 * "*" badge is pure duplication, since the wildcard entry already covers it
 * (see hasEffectiveGrant above for the same subsumption rule applied to
 * grant membership rather than display). The wildcard entry itself is
 * always kept (from whichever source actually holds it).
 *
 * `wildcardSource` matters because the wildcard covering a direct grant
 * often comes from an assigned POLICY, not another direct grant - e.g. a
 * "system_superuser" policy with resource_type "*" already covers a direct
 * "permissions:grant" on "permissions" grant, even though neither is a
 * direct grant of the other. Callers filtering a raw direct-grant list
 * should pass the full effective list (buildEffectivePermissionList,
 * fanned-out policies + direct grants) as `wildcardSource` so a
 * policy-sourced wildcard is honored too, not just a wildcard that happens
 * to also be a direct grant.
 *
 * Used by the "Direct permissions"/"Effective permissions" badge lists
 * (AccountStatusCard, UserDetailsDialog) - unlike UserPermissionsDialog's
 * revoke list, which intentionally keeps every literal grant since each row
 * there is individually revocable. */
export function dedupeAgainstWildcards<T extends { action: string; resource_type: string }>(
    grants: T[],
    wildcardSource: { action: string; resource_type: string }[] = grants
): T[] {
    const wildcardActions = new Set(
        wildcardSource.filter((g) => g.resource_type === WILDCARD_RESOURCE_TYPE).map((g) => g.action)
    );
    return grants.filter(
        (g) => g.resource_type === WILDCARD_RESOURCE_TYPE || !wildcardActions.has(g.action)
    );
}

/** Same subsumption check as dedupeAgainstWildcards, for a single
 * (action, resource_type) pair rather than a whole list - the wildcard
 * entry itself is never "subsumed" (only a more specific grant can be). */
export function isSubsumedByWildcard(
    target: { action: string; resource_type: string },
    source: { action: string; resource_type: string }[]
): boolean {
    if (target.resource_type === WILDCARD_RESOURCE_TYPE) return false;
    return source.some(
        (g) => g.action === target.action && g.resource_type === WILDCARD_RESOURCE_TYPE
    );
}

/** Same "already effectively held" check as policyAddsNothingNew, for a
 * single (action, resource_type) pair rather than a whole policy's worth -
 * used by UserPermissionsDialog's direct-grant dropdown, which offers one
 * catalog entry (one action/resource_type pair) at a time. */
export function isAlreadyEffectivelyGranted(
    effectiveGrantKeys: Set<string>,
    action: string,
    resourceType: string
): boolean {
    return hasEffectiveGrant(effectiveGrantKeys, action, resourceType);
}
