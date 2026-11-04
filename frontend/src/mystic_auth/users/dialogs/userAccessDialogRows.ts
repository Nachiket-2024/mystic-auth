import type { UserAccessState } from "./UserAccessDialogAtoms";

/**
 * Derived lists for the access dialog: the merged policy list and the
 * catalog rows after the search box and on/off filter are applied. Pure, so
 * the dialog component keeps only layout and tab keyboard handling.
 */
export function buildUserAccessRows(state: UserAccessState) {
  const catalog = state.catalogQuery.data ?? [];
  const totalGranted = catalog.filter((entry) =>
    state.isAlreadyEffectivelyGranted(
      state.effectiveGrantKeys,
      entry.action,
      entry.resource_type,
    ),
  ).length;
  const allPolicies = [
    ...new Map(
      [...state.assignedPolicies, ...(state.allPoliciesQuery.data ?? [])].map(
        (policy) => [policy.name, policy],
      ),
    ).values(),
  ];
  const policyQuery = state.polQuery.trim().toLowerCase();
  // Keep the catalog order stable while toggles refresh assignment state.
  // Sorting assigned policies to the top made the row jump immediately
  // after a click, forcing permission holders to relocate the item they just
  // changed. The filter still controls visibility; assignment should not.
  const policyRows = allPolicies
    .filter(
      (policy) =>
        state.polFilter === "all" ||
        (state.polFilter === "on") === state.assignedNames.has(policy.name),
    )
    .filter(
      (policy) =>
        !policyQuery ||
        policy.name.toLowerCase().includes(policyQuery) ||
        policy.description?.toLowerCase().includes(policyQuery),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const permissionQuery = state.permQuery.trim().toLowerCase();
  const permissionRows = catalog.filter(
    (entry) =>
      (state.permFilter === "all" ||
        (state.permFilter === "on") ===
          state.isAlreadyEffectivelyGranted(
            state.effectiveGrantKeys,
            entry.action,
            entry.resource_type,
          )) &&
      (!permissionQuery ||
        entry.action.toLowerCase().includes(permissionQuery) ||
        entry.description?.toLowerCase().includes(permissionQuery) ||
        entry.resource_type.toLowerCase().includes(permissionQuery)),
  );
  const permissionGroups = [
    ...new Set(catalog.map((entry) => entry.resource_type)),
  ].filter((group) =>
    permissionRows.some((entry) => entry.resource_type === group),
  );

  return { catalog, totalGranted, allPolicies, policyRows, permissionRows, permissionGroups };
}
