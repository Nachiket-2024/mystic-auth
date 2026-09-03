import React, { useState } from "react";
import { Box, Button, Dialog, HStack, Portal, Stack, Text } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { usePoliciesQuery, useMyPoliciesQuery } from "../../policies/queries/policyQueries";
import { useMyPermissionsQuery } from "../../policies/queries/permissionQueries";
import { useBulkAssignPoliciesMutation, useBulkRemovePoliciesMutation } from "../../policies/queries/bulkAssignmentMutations";
import { buildEffectiveGrantKeySet, policyAddsNothingNew } from "../../policies/logic/effectiveGrants";
import { useAuthStore } from "../../store/authStore";
import { IfCan } from "../../authorization/IfCan";
import { PERMISSIONS } from "../../authorization/permissions";
import StyledSelect from "../../ui/StyledSelect";
import BulkOperationResultList from "./BulkOperationResultList";
import { toaster } from "../../ui/toaster/toasterInstance";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../../ui/styles/dialogStyles";
import { BRAND_SOLID_HOVER_PROPS, CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

interface BulkPolicyAssignDialogProps {
    isOpen: boolean;
    userEmails: string[];
    onClose: () => void;
}

/** Applies one chosen policy (assign or remove) to every user in
 * `userEmails`, using the real bulk endpoints rather than looping over the
 * single-item assign/revoke calls; see bulkAssignment_api.ts. */
const BulkPolicyAssignDialog: React.FC<BulkPolicyAssignDialogProps> = ({ isOpen, userEmails, onClose }) => {
    const { t } = useTranslation(["users", "ui_text"]);
    const [policyName, setPolicyName] = useState("");

    // Which mutation's result to show. Not derived from `.isPending`: both
    // are false once either settles, which would silently fall back to
    // whichever mutation is listed second. Tracked from the last click instead.
    const [lastAction, setLastAction] = useState<"assign" | "remove" | null>(null);

    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setPolicyName("");
            setLastAction(null);
        }
    }

    const policiesQuery = usePoliciesQuery(isOpen);

    // Excluding a policy that adds nothing new only makes sense when exactly
    // one user is selected and that user is the viewer: only then is "does
    // this user already effectively hold it" unambiguous, and only the
    // viewer's own grants are reachable via /me without an extra permission
    // check. Any other selection shows the full, unfiltered list.
    const currentUserEmail = useAuthStore((s) => s.email);
    const isSoleSelectionSelf = userEmails.length === 1 && userEmails[0] === currentUserEmail;
    const myPoliciesQuery = useMyPoliciesQuery(isOpen && isSoleSelectionSelf);
    const myPermissionsQuery = useMyPermissionsQuery(isOpen && isSoleSelectionSelf);
    const effectiveGrantKeys = isSoleSelectionSelf
        ? buildEffectiveGrantKeySet(myPoliciesQuery.data?.policies ?? [], myPermissionsQuery.data?.permissions ?? [])
        : null;
    const selectablePolicies = (policiesQuery.data ?? []).filter(
        (p) => !effectiveGrantKeys || !policyAddsNothingNew(p, effectiveGrantKeys)
    );

    const assignMutation = useBulkAssignPoliciesMutation();
    const removeMutation = useBulkRemovePoliciesMutation();
    const activeMutation = lastAction === "remove" ? removeMutation : assignMutation;

    // react-query mutations keep their last `.data`/`.isSuccess` around
    // across remounts, so without this a reopened dialog showed the
    // previous run's success summary before anything happened this time.
    if (isOpen !== prevIsOpen && isOpen) {
        assignMutation.reset();
        removeMutation.reset();
    }

    const handleAssign = () => {
        if (!policyName) return;
        setLastAction("assign");
        assignMutation.mutate(
            { userEmails, policyName },
            { onError: (error) => toaster.create({ title: error.message, type: "error" }) }
        );
    };

    const handleRemove = () => {
        if (!policyName) return;
        setLastAction("remove");
        removeMutation.mutate(
            { userEmails, policyName },
            { onError: (error) => toaster.create({ title: error.message, type: "error" }) }
        );
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={(details) => !details.open && onClose()} size="md" closeOnInteractOutside>
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                    <Dialog.Content {...DIALOG_CONTENT_PROPS}>
                        <Dialog.Header>
                            <Dialog.Title>{t("users:bulkActions.assignPolicyDialogTitle", { count: userEmails.length })}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Stack gap={4}>
                                <StyledSelect
                                    w="full"
                                    value={policyName}
                                    onChange={setPolicyName}
                                    ariaLabel={t("users:policiesDialog.selectPolicyAriaLabel")}
                                    options={[
                                        { value: "", label: t("users:policiesDialog.selectPolicyToAssign") },
                                        ...selectablePolicies.map((p) => ({ value: p.name, label: p.name })),
                                    ]}
                                />
                                <HStack>
                                    <Button
                                        size="sm"
                                        colorPalette="brand"
                                        onClick={handleAssign}
                                        disabled={!policyName}
                                        loading={assignMutation.isPending}
                                        {...BRAND_SOLID_HOVER_PROPS}
                                    >
                                        {t("users:bulkActions.assignToSelected")}
                                    </Button>
                                    <IfCan action={PERMISSIONS.POLICIES_REVOKE}>
                                        <Button size="sm" onClick={handleRemove} disabled={!policyName} loading={removeMutation.isPending} {...SECONDARY_BUTTON_PROPS}>
                                            {t("users:bulkActions.removeFromSelected")}
                                        </Button>
                                    </IfCan>
                                </HStack>
                                {activeMutation.data && (
                                    <Box>
                                        <Text fontSize="sm" fontWeight="medium" mb={1}>
                                            {t("users:bulkActions.resultSummary", {
                                                success: activeMutation.data.success_count,
                                                error: activeMutation.data.error_count,
                                            })}
                                        </Text>
                                        <BulkOperationResultList results={activeMutation.data.results} />
                                    </Box>
                                )}
                            </Stack>
                        </Dialog.Body>
                        <Dialog.Footer>
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
        </Dialog.Root>
    );
};

export default BulkPolicyAssignDialog;
