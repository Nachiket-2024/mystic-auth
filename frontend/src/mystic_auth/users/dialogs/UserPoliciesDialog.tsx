import React from "react";
import { Box, Button, Dialog, HStack, Portal, Stack, Text, Wrap } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import LoadingState from "../../ui/LoadingState";
import FormAlert from "../../ui/FormAlert";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { isForbiddenError } from "../../api/apiError";
import StyledSelect from "../../ui/StyledSelect";
import { IfCan } from "../../authorization/IfCan";
import { PERMISSIONS } from "../../authorization/permissions";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../../ui/styles/dialogStyles";
import { BRAND_SOLID_HOVER_PROPS, BRAND_SUBTLE_BUTTON_PROPS, CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../../ui/styles/buttonStyles";
import { useUserPoliciesDialogState } from "./useUserPoliciesDialogState";
import PolicyAssignmentListItem from "./PolicyAssignmentListItem";

interface UserPoliciesDialogProps {
    isOpen: boolean;
    userEmail: string | null;
    /** True when the target is the reserved system account: the backend
     * rejects every assign/revoke against it (SYSTEM_USER_CANNOT_BE_MODIFIED,
     * see policy_assignment_routes.py), so the assign control and every
     * per-policy/per-action revoke control are disabled here too (same
     * "don't offer a control that can only ever 403" reasoning as the Users
     * table's row actions in usersColumns.tsx). */
    isSystemUser?: boolean;
    onClose: () => void;
}

/**
 * UserPoliciesDialog
 * ----------------------------
 * Shows the policies currently assigned to one user, with controls to
 * assign an additional policy or revoke an existing one (either whole, or
 * one action at a time - see PolicyAssignmentListItem). This is the
 * frontend surface for /authorization/users/{email}/policies: the actual
 * grant/revoke decision is enforced server-side either way, this is purely
 * the management UI for it. Query selection and handlers live in
 * useUserPoliciesDialogState.
 */
const UserPoliciesDialog: React.FC<UserPoliciesDialogProps> = ({ isOpen, userEmail, isSystemUser = false, onClose }) => {
    const { t } = useTranslation(["users", "ui_text"]);
    const {
        isSelf,
        userPoliciesQuery,
        assignedPolicies,
        availableToAssign,
        selectedPolicy,
        setSelectedPolicy,
        revokingPolicy,
        setRevokingPolicy,
        revokingAction,
        setRevokingAction,
        expandedPolicies,
        togglePolicyExpanded,
        expandAll,
        collapseAll,
        assignMutation,
        revokeMutation,
        revokeActionMutation,
        handleAssign,
        handleRevokeConfirm,
        handleRevokeActionConfirm,
    } = useUserPoliciesDialogState(isOpen, userEmail);

    if (!userEmail) return null;

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={(details) => !details.open && onClose()}
            size="lg"
            closeOnInteractOutside
        >
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                    <Dialog.Content {...DIALOG_CONTENT_PROPS}>
                        <Dialog.Header>
                            <Dialog.Title>{t("users:policiesDialog.titleFor", { email: userEmail })}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Stack gap={4}>
                                {/* fontSize="md", not "sm": matches ConfirmDialog's
                                    Dialog.Description sizing so the note here reads at
                                    the same size as every other dialog's body copy. */}
                                {isSelf && (
                                    <Text fontSize="md" color="fg.muted">
                                        {t("users:policiesDialog.cannotRevokeOwn")}
                                    </Text>
                                )}
                                {isSystemUser && (
                                    <Text fontSize="md" color="fg.muted">
                                        {t("users:columns.cannotModifySystemUser")}
                                    </Text>
                                )}
                                {userPoliciesQuery.isLoading ? (
                                    <LoadingState message={t("users:policiesDialog.loadingPolicies")} />
                                ) : userPoliciesQuery.isError ? (
                                    <FormAlert status="error">
                                        {isForbiddenError(userPoliciesQuery.error)
                                            ? t("ui_text:notAuthorizedToView")
                                            : t("users:policiesDialog.failedToLoad")}
                                    </FormAlert>
                                ) : assignedPolicies.length === 0 ? (
                                    <Text color="fg.muted">{t("users:policiesDialog.noPoliciesAssigned")}</Text>
                                ) : (
                                    <Stack gap={2}>
                                        <HStack justify="flex-end" gap={2}>
                                            <Button size="2xs" {...BRAND_SUBTLE_BUTTON_PROPS} onClick={expandAll}>
                                                {t("users:policiesDialog.expandAll")}
                                            </Button>
                                            <Button size="2xs" {...BRAND_SUBTLE_BUTTON_PROPS} onClick={collapseAll}>
                                                {t("users:policiesDialog.collapseAll")}
                                            </Button>
                                        </HStack>
                                        <Wrap gap={2}>
                                            {assignedPolicies.map((p) => (
                                                <PolicyAssignmentListItem
                                                    key={p.name}
                                                    policy={p}
                                                    isExpanded={expandedPolicies.has(p.name)}
                                                    onToggleExpanded={() => togglePolicyExpanded(p.name)}
                                                    isSelf={isSelf}
                                                    isSystemUser={isSystemUser}
                                                    onRevokePolicy={() => setRevokingPolicy(p.name)}
                                                    isRevokePolicyPending={revokeMutation.isPending && revokeMutation.variables?.policyName === p.name}
                                                    onRevokeAction={(action) => setRevokingAction({ policyName: p.name, action })}
                                                    isRevokeActionPending={(action) =>
                                                        revokeActionMutation.isPending &&
                                                        revokeActionMutation.variables?.policyName === p.name &&
                                                        revokeActionMutation.variables?.action === action
                                                    }
                                                />
                                            ))}
                                        </Wrap>
                                    </Stack>
                                )}

                                {/* Assigning to the reserved system account 403s the same
                                    way revoking from it does (SYSTEM_USER_CANNOT_BE_MODIFIED),
                                    so the whole assign control is withheld rather than left
                                    to fail on submit. */}
                                <IfCan action={PERMISSIONS.POLICIES_ASSIGN}>
                                  {!isSystemUser && (
                                    <HStack>
                                        <Box flex="1">
                                            <StyledSelect
                                                w="full"
                                                value={selectedPolicy}
                                                onChange={setSelectedPolicy}
                                                ariaLabel={t("users:policiesDialog.selectPolicyAriaLabel")}
                                                options={[
                                                    { value: "", label: t("users:policiesDialog.selectPolicyToAssign") },
                                                    ...availableToAssign.map((p) => ({ value: p.name, label: p.name })),
                                                ]}
                                            />
                                        </Box>
                                        <Button
                                            size="sm"
                                            colorPalette="brand"
                                            onClick={handleAssign}
                                            disabled={!selectedPolicy}
                                            loading={assignMutation.isPending}
                                            {...BRAND_SOLID_HOVER_PROPS}
                                        >
                                            {t("users:policiesDialog.assign")}
                                        </Button>
                                    </HStack>
                                  )}
                                </IfCan>
                            </Stack>
                        </Dialog.Body>
                        <Dialog.Footer>
                            <Button onClick={onClose} {...SECONDARY_BUTTON_PROPS}>
                                {t("ui_text:close")}
                            </Button>
                        </Dialog.Footer>
                        {/* Chakra v3's Dialog.CloseTrigger renders no icon of its own
                            (unlike v2); without explicit children it was an empty
                            0x0 button, invisible to every user (axe-core button-name
                            audit), not just screen readers. */}
                        <Dialog.CloseTrigger aria-label={t("ui_text:closeDialog")} {...CLOSE_TRIGGER_PROPS}>
                            <X size={16} aria-hidden="true" />
                        </Dialog.CloseTrigger>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>

            {/* Revoking strips access immediately and irreversibly. Every other
                destructive action in the app (delete/purge a user, delete a
                policy) already goes through ConfirmDialog; this one-click X
                button was the odd one out. */}
            <ConfirmDialog
                isOpen={!!revokingPolicy}
                title={t("users:policiesDialog.revokeDialogTitle")}
                description={t("users:policiesDialog.revokeDialogDescription", { policyName: revokingPolicy, email: userEmail })}
                confirmLabel={t("users:policiesDialog.revokeConfirmLabel")}
                isLoading={revokeMutation.isPending}
                onConfirm={handleRevokeConfirm}
                onCancel={() => setRevokingPolicy(null)}
            />

            <ConfirmDialog
                isOpen={!!revokingAction}
                title={t("users:policiesDialog.revokeActionDialogTitle")}
                description={
                    revokingAction
                        ? t("users:policiesDialog.revokeActionDialogDescription", {
                              action: revokingAction.action,
                              policyName: revokingAction.policyName,
                              email: userEmail,
                          })
                        : ""
                }
                confirmLabel={t("users:policiesDialog.revokeConfirmLabel")}
                isLoading={revokeActionMutation.isPending}
                onConfirm={handleRevokeActionConfirm}
                onCancel={() => setRevokingAction(null)}
            />
        </Dialog.Root>
    );
};

export default UserPoliciesDialog;
