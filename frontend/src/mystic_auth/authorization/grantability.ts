type Can = (action: string, resourceType?: string) => boolean;

/**
 * Mirrors the backend's assert_authorized_to_grant: the caller must hold the action, except
 * that a system_superuser holder may grant any action without holding it.
 */
export function canGrantAction(action: string, can: Can, isSystemSuperuser = false): boolean {
    if (isSystemSuperuser) return true;
    return can(action);
}

export function canGrantPolicy(policy: { actions: string[] }, can: Can, isSystemSuperuser = false): boolean {
    return policy.actions.every((action) => canGrantAction(action, can, isSystemSuperuser));
}
