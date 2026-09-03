import React, { useState } from "react";
import { Button, Dialog, HStack, Portal, Stack, Text, Textarea, Wrap } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import Badge from "../../ui/Badge";
import StyledSelect from "../../ui/StyledSelect";
import { useUserPermissionsQuery, useMyPermissionsQuery, usePermissionCatalogQuery } from "../../policies/queries/permissionQueries";
import { useGrantPermissionMutation, useRevokePermissionMutation } from "../../policies/queries/permissionMutations";
import { useUserPoliciesQuery, useMyPoliciesQuery } from "../../policies/queries/policyQueries";
import { buildEffectiveGrantKeySet, isAlreadyEffectivelyGranted } from "../../policies/logic/effectiveGrants";
import { toaster } from "../../ui/toaster/toasterInstance";
import LoadingState from "../../ui/LoadingState";
import FormAlert from "../../ui/FormAlert";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { isForbiddenError } from "../../api/apiError";
import { IfCan } from "../../authorization/IfCan";
import { PERMISSIONS } from "../../authorization/permissions";
import { useAuthStore } from "../../store/authStore";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../../ui/styles/dialogStyles";
import { BRAND_SOLID_HOVER_PROPS, CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../../ui/styles/buttonStyles";
import { FAST_HOVER_TRANSITION } from "../../theme/system";

interface UserPermissionsDialogProps {
    isOpen: boolean;
    userEmail: string | null;
    /** True when the target is the reserved system account: the backend
     * rejects every grant/revoke against it (SYSTEM_USER_CANNOT_BE_MODIFIED,
     * see permission_assignment_routes.py), same as UserPoliciesDialog's
     * isSystemUser prop. */
    isSystemUser?: boolean;
    onClose: () => void;
}

/**
 * UserPermissionsDialog
 * ----------------------------
 * The granular counterpart to UserPoliciesDialog: grants/revokes a single
 * action directly to a user, bypassing Policy entirely (see backend's
 * authorization/models/user_permission_model.py for why this exists
 * alongside policy assignment, not instead of it). Deliberately its own
 * dialog rather than a tab inside UserPoliciesDialog, since policies and
 * direct grants are two different concepts an admin chooses between.
 *
 * The "already granted" exclusion below (effectiveGrantKeys, folded into
 * the action dropdown via isAlreadyEffectivelyGranted) needs both this
 * user's current direct grants and their assigned policies' actions: a
 * candidate already held via a Policy alone must still be excluded, or
 * granting it directly just creates a redundant UserPermission row. When
 * userEmail is the viewer's own account (isSelf), the policies half
 * switches to the self-service GET /authorization/users/me/policies (no
 * policies:read required) instead of the management endpoint (which
 * requires it). Without this, an admin holding permissions:grant but not
 * policies:read who opened this dialog for themselves would have the
 * management fetch silently 403, fall back to direct-grants-only, and let
 * them "grant" themselves an action they already hold via a policy.
 */
const UserPermissionsDialog: React.FC<UserPermissionsDialogProps> = ({ isOpen, userEmail, isSystemUser = false, onClose }) => {
    const { t } = useTranslation(["users", "ui_text"]);
    const [action, setAction] = useState("");
    const [resourceType, setResourceType] = useState("");
    const [conditionsText, setConditionsText] = useState("");
    const [conditionsError, setConditionsError] = useState<string | null>(null);
    const [revoking, setRevoking] = useState<{ action: string; resourceType: string } | null>(null);

    // Same "reset on open, adjusted during render" pattern as
    // UserPoliciesDialog/PolicyFormDialog; see either's comment.
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setAction("");
            setResourceType("");
            setConditionsText("");
            setConditionsError(null);
            setRevoking(null);
        }
    }

    const currentUserEmail = useAuthStore((s) => s.email);
    // Same self-revoke lockout-avoidance reasoning as UserPoliciesDialog.
    const isSelf = !!userEmail && userEmail === currentUserEmail;

    // Two query pairs, only one enabled at a time; see this component's
    // docstring for why isSelf needs the self-service pair instead of the
    // management (permission-gated) one.
    const managementPermissionsQuery = useUserPermissionsQuery(userEmail ?? "", isOpen && !!userEmail && !isSelf);
    const managementPoliciesQuery = useUserPoliciesQuery(userEmail ?? "", isOpen && !!userEmail && !isSelf);
    const myPermissionsQuery = useMyPermissionsQuery(isOpen && isSelf);
    const myPoliciesQuery = useMyPoliciesQuery(isOpen && isSelf);

    const permissionsQuery = isSelf ? myPermissionsQuery : managementPermissionsQuery;
    // Fetched here too (UserPoliciesDialog already loads it for its own
    // dialog) so the grant dropdown can exclude actions the user already
    // effectively has via an assigned Policy, not just via a prior direct
    // grant; see effectiveGrants.ts.
    const userPoliciesQuery = isSelf ? myPoliciesQuery : managementPoliciesQuery;
    const catalogQuery = usePermissionCatalogQuery();
    const grantMutation = useGrantPermissionMutation();
    const revokeMutation = useRevokePermissionMutation();

    // Selecting an action locks resourceType to that action's real
    // resource_type (see authorization/permissions_catalog.py): a direct
    // grant only ever makes sense against it, so letting an admin diverge
    // here would just create a grant no route will ever match.
    const handleActionChange = (nextAction: string) => {
        setAction(nextAction);
        const entry = catalogQuery.data?.find((e) => e.action === nextAction);
        setResourceType(entry?.resource_type ?? "");
    };

    if (!userEmail) return null;

    const handleGrant = () => {
        if (!action.trim() || !resourceType.trim()) return;

        let conditions: Record<string, unknown> | undefined;
        if (conditionsText.trim()) {
            try {
                conditions = JSON.parse(conditionsText);
            } catch {
                setConditionsError(t("users:permissionsDialog.invalidConditionsJson"));
                return;
            }
        }
        setConditionsError(null);

        grantMutation.mutate(
            { userEmail, action: action.trim(), resource_type: resourceType.trim(), conditions },
            {
                onSuccess: () => {
                    toaster.create({ title: t("users:permissionsDialog.grantedToast", { action }), type: "success" });
                    setAction("");
                    setResourceType("");
                    setConditionsText("");
                },
                onError: (error) => toaster.create({ title: error.message, type: "error" }),
            }
        );
    };

    const handleRevokeConfirm = () => {
        if (!revoking) return;
        revokeMutation.mutate(
            { userEmail, action: revoking.action, resourceType: revoking.resourceType },
            {
                onSuccess: () => {
                    toaster.create({ title: t("users:permissionsDialog.revokedToast", { action: revoking.action }), type: "success" });
                    setRevoking(null);
                },
                onError: (error) => {
                    toaster.create({ title: error.message, type: "error" });
                    setRevoking(null);
                },
            }
        );
    };

    const grants = permissionsQuery.data?.permissions ?? [];
    const effectiveGrantKeys = buildEffectiveGrantKeySet(userPoliciesQuery.data?.policies ?? [], grants);

    return (
        <Dialog.Root open={isOpen} onOpenChange={(details) => !details.open && onClose()} size="lg" closeOnInteractOutside>
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                    <Dialog.Content {...DIALOG_CONTENT_PROPS}>
                        <Dialog.Header>
                            <Dialog.Title>{t("users:permissionsDialog.titleFor", { email: userEmail })}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Stack gap={4}>
                                {/* fontSize="md", not "sm": matches ConfirmDialog's
                                    Dialog.Description sizing so this dialog's body copy
                                    reads at the same size as every other dialog's. */}
                                <Text fontSize="md" color="fg.muted">
                                    {t("users:permissionsDialog.explainer")}
                                </Text>
                                {isSelf && (
                                    <Text fontSize="md" color="fg.muted">
                                        {t("users:permissionsDialog.cannotRevokeOwn")}
                                    </Text>
                                )}
                                {isSystemUser && (
                                    <Text fontSize="md" color="fg.muted">
                                        {t("users:columns.cannotModifySystemUser")}
                                    </Text>
                                )}
                                {permissionsQuery.isLoading ? (
                                    <LoadingState message={t("users:permissionsDialog.loadingPermissions")} />
                                ) : permissionsQuery.isError ? (
                                    <FormAlert status="error">
                                        {isForbiddenError(permissionsQuery.error)
                                            ? t("ui_text:notAuthorizedToView")
                                            : t("users:permissionsDialog.failedToLoad")}
                                    </FormAlert>
                                ) : grants.length === 0 ? (
                                    <Text color="fg.muted">{t("users:permissionsDialog.noPermissionsGranted")}</Text>
                                ) : (
                                    <Wrap gap={2}>
                                        {grants.map((g) => (
                                            <Badge key={`${g.action}:${g.resource_type}`} colorPalette="teal" variant="subtle" size="md" px={2} py={1} maxW="16rem">
                                                <HStack gap={2} minW={0}>
                                                    <Text flex="1 1 auto" minW={0} maxW="100%" truncate title={`${g.action} (${g.resource_type})`}>
                                                        {g.action} <Text as="span" color="fg.muted">({g.resource_type})</Text>
                                                    </Text>
                                                    <IfCan action={PERMISSIONS.PERMISSIONS_REVOKE}>
                                                        <Button
                                                            size="2xs"
                                                            variant="ghost"
                                                            flexShrink={0}
                                                            aria-label={t("users:permissionsDialog.revokeAriaLabel", { action: g.action })}
                                                            onClick={() => setRevoking({ action: g.action, resourceType: g.resource_type })}
                                                            disabled={isSelf || isSystemUser}
                                                            title={
                                                                isSelf
                                                                    ? t("users:permissionsDialog.cannotRevokeOwnTitle")
                                                                    : isSystemUser
                                                                      ? t("users:columns.cannotModifySystemUser")
                                                                      : undefined
                                                            }
                                                            loading={
                                                                revokeMutation.isPending &&
                                                                revokeMutation.variables?.action === g.action &&
                                                                revokeMutation.variables?.resourceType === g.resource_type
                                                            }
                                                            _hover={{ bg: "red.100", color: "fg.error" }}
                                                            _dark={{ _hover: { bg: "red.900" } }}
                                                            transition={FAST_HOVER_TRANSITION}
                                                        >
                                                            <X size={12} aria-hidden="true" />
                                                        </Button>
                                                    </IfCan>
                                                </HStack>
                                            </Badge>
                                        ))}
                                    </Wrap>
                                )}

                                {/* Granting to the reserved system account 403s the same way
                                    revoking from it does (SYSTEM_USER_CANNOT_BE_MODIFIED), so
                                    the whole grant control is withheld rather than left to fail
                                    on submit, same as UserPoliciesDialog's assign control. */}
                                <IfCan action={PERMISSIONS.PERMISSIONS_GRANT}>
                                  {!isSystemUser && (
                                    <Stack gap={2}>
                                        <HStack>
                                            <StyledSelect
                                                size="sm"
                                                ariaLabel={t("users:permissionsDialog.actionAriaLabel")}
                                                placeholder={t("users:permissionsDialog.actionPlaceholder")}
                                                value={action}
                                                onChange={handleActionChange}
                                                options={(catalogQuery.data ?? [])
                                                    .filter((entry) => !isAlreadyEffectivelyGranted(effectiveGrantKeys, entry.action, entry.resource_type))
                                                    .map((entry) => ({
                                                        value: entry.action,
                                                        label: entry.action,
                                                    }))}
                                            />
                                            <StyledSelect
                                                size="sm"
                                                ariaLabel={t("users:permissionsDialog.resourceTypeAriaLabel")}
                                                placeholder={t("users:permissionsDialog.resourceTypePlaceholder")}
                                                value={resourceType}
                                                onChange={() => undefined}
                                                disabled
                                                title={t("users:permissionsDialog.resourceTypeAutoTitle")}
                                                options={resourceType ? [{ value: resourceType, label: resourceType }] : []}
                                            />
                                        </HStack>
                                        <Textarea
                                            size="sm"
                                            rows={2}
                                            placeholder={t("users:permissionsDialog.conditionsPlaceholder")}
                                            value={conditionsText}
                                            onChange={(e) => setConditionsText(e.target.value)}
                                        />
                                        {conditionsError && <FormAlert status="error">{conditionsError}</FormAlert>}
                                    </Stack>
                                  )}
                                </IfCan>
                            </Stack>
                        </Dialog.Body>
                        <Dialog.Footer>
                            {!isSystemUser && (
                                <IfCan action={PERMISSIONS.PERMISSIONS_GRANT}>
                                    <Button
                                        size="sm"
                                        colorPalette="brand"
                                        onClick={handleGrant}
                                        disabled={!action.trim() || !resourceType.trim()}
                                        loading={grantMutation.isPending}
                                        {...BRAND_SOLID_HOVER_PROPS}
                                    >
                                        {t("users:permissionsDialog.grant")}
                                    </Button>
                                </IfCan>
                            )}
                            <Button onClick={onClose} {...SECONDARY_BUTTON_PROPS}>
                                {t("ui_text:close")}
                            </Button>
                        </Dialog.Footer>
                        <Dialog.CloseTrigger aria-label={t("ui_text:closeDialog")} {...CLOSE_TRIGGER_PROPS}>
                            <X size={16} aria-hidden="true" />
                        </Dialog.CloseTrigger>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>

            <ConfirmDialog
                isOpen={!!revoking}
                title={t("users:permissionsDialog.revokeDialogTitle")}
                description={t("users:permissionsDialog.revokeDialogDescription", { action: revoking?.action, email: userEmail })}
                confirmLabel={t("users:permissionsDialog.revokeConfirmLabel")}
                isLoading={revokeMutation.isPending}
                onConfirm={handleRevokeConfirm}
                onCancel={() => setRevoking(null)}
            />
        </Dialog.Root>
    );
};

export default UserPermissionsDialog;
