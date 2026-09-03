import React, { useState } from "react";
import { Box, Button, Dialog, HStack, Portal, Stack, Text, Textarea } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useBulkAssignPermissionsMutation, useBulkRemovePermissionsMutation } from "../../policies/queries/bulkAssignmentMutations";
import { usePermissionCatalogQuery, useMyPermissionsQuery } from "../../policies/queries/permissionQueries";
import { useMyPoliciesQuery } from "../../policies/queries/policyQueries";
import { buildEffectiveGrantKeySet, isAlreadyEffectivelyGranted } from "../../policies/logic/effectiveGrants";
import { useAuthStore } from "../../store/authStore";
import { IfCan } from "../../authorization/IfCan";
import { PERMISSIONS } from "../../authorization/permissions";
import StyledSelect from "../../ui/StyledSelect";
import BulkOperationResultList from "./BulkOperationResultList";
import FormAlert from "../../ui/FormAlert";
import { toaster } from "../../ui/toaster/toasterInstance";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../../ui/styles/dialogStyles";
import { BRAND_SOLID_HOVER_PROPS, CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

interface BulkPermissionGrantDialogProps {
    isOpen: boolean;
    userEmails: string[];
    onClose: () => void;
}

/** Applies one chosen direct permission grant (action + resource_type +
 * optional conditions) to every user in `userEmails`. Grant/revoke
 * counterpart to BulkPolicyAssignDialog; see that file's docstring. */
const BulkPermissionGrantDialog: React.FC<BulkPermissionGrantDialogProps> = ({ isOpen, userEmails, onClose }) => {
    const { t } = useTranslation(["users", "ui_text"]);
    const [action, setAction] = useState("");
    const [resourceType, setResourceType] = useState("");
    const [conditionsText, setConditionsText] = useState("");
    const [conditionsError, setConditionsError] = useState<string | null>(null);

    // See BulkPolicyAssignDialog: not derived from `.isPending`, tracked
    // from whichever button was clicked instead.
    const [lastAction, setLastAction] = useState<"grant" | "revoke" | null>(null);

    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setAction("");
            setResourceType("");
            setConditionsText("");
            setConditionsError(null);
            setLastAction(null);
        }
    }

    const catalogQuery = usePermissionCatalogQuery();

    // See BulkPolicyAssignDialog: exclusion only makes sense (and is only
    // reachable, via the self-service /me endpoints) when exactly one user
    // is selected and that user is the viewer.
    const currentUserEmail = useAuthStore((s) => s.email);
    const isSoleSelectionSelf = userEmails.length === 1 && userEmails[0] === currentUserEmail;
    const myPoliciesQuery = useMyPoliciesQuery(isOpen && isSoleSelectionSelf);
    const myPermissionsQuery = useMyPermissionsQuery(isOpen && isSoleSelectionSelf);
    const effectiveGrantKeys = isSoleSelectionSelf
        ? buildEffectiveGrantKeySet(myPoliciesQuery.data?.policies ?? [], myPermissionsQuery.data?.permissions ?? [])
        : null;
    const selectableCatalog = (catalogQuery.data ?? []).filter(
        (entry) => !effectiveGrantKeys || !isAlreadyEffectivelyGranted(effectiveGrantKeys, entry.action, entry.resource_type)
    );

    const grantMutation = useBulkAssignPermissionsMutation();
    const revokeMutation = useBulkRemovePermissionsMutation();
    const activeMutation = lastAction === "revoke" ? revokeMutation : grantMutation;

    // See BulkPolicyAssignDialog: react-query mutations keep their last
    // `.data` around across remounts, so this avoids showing the previous
    // run's success summary again before this run does anything.
    if (isOpen !== prevIsOpen && isOpen) {
        grantMutation.reset();
        revokeMutation.reset();
    }

    // Same "action drives resource_type" lock as UserPermissionsDialog - see
    // its own comment.
    const handleActionChange = (nextAction: string) => {
        setAction(nextAction);
        const entry = catalogQuery.data?.find((e) => e.action === nextAction);
        setResourceType(entry?.resource_type ?? "");
    };

    const parseConditions = (): Record<string, unknown> | undefined | false => {
        if (!conditionsText.trim()) return undefined;
        try {
            return JSON.parse(conditionsText);
        } catch {
            setConditionsError(t("users:permissionsDialog.invalidConditionsJson"));
            return false;
        }
    };

    const handleGrant = () => {
        if (!action.trim() || !resourceType.trim()) return;
        const conditions = parseConditions();
        if (conditions === false) return;
        setConditionsError(null);
        setLastAction("grant");
        grantMutation.mutate(
            { userEmails, action: action.trim(), resourceType: resourceType.trim(), conditions: conditions || undefined },
            { onError: (error) => toaster.create({ title: error.message, type: "error" }) }
        );
    };

    const handleRevoke = () => {
        if (!action.trim() || !resourceType.trim()) return;
        setLastAction("revoke");
        revokeMutation.mutate(
            { userEmails, action: action.trim(), resourceType: resourceType.trim() },
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
                            <Dialog.Title>{t("users:bulkActions.grantPermissionDialogTitle", { count: userEmails.length })}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Stack gap={4}>
                                <HStack>
                                    <StyledSelect
                                        size="sm"
                                        ariaLabel={t("users:permissionsDialog.actionAriaLabel")}
                                        placeholder={t("users:permissionsDialog.actionPlaceholder")}
                                        value={action}
                                        onChange={handleActionChange}
                                        options={selectableCatalog.map((entry) => ({ value: entry.action, label: entry.action }))}
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
                                <HStack>
                                    <Button
                                        size="sm"
                                        colorPalette="brand"
                                        onClick={handleGrant}
                                        disabled={!action.trim() || !resourceType.trim()}
                                        loading={grantMutation.isPending}
                                        {...BRAND_SOLID_HOVER_PROPS}
                                    >
                                        {t("users:bulkActions.grantToSelected")}
                                    </Button>
                                    <IfCan action={PERMISSIONS.PERMISSIONS_REVOKE}>
                                        <Button
                                            size="sm"
                                            onClick={handleRevoke}
                                            disabled={!action.trim() || !resourceType.trim()}
                                            loading={revokeMutation.isPending}
                                            {...SECONDARY_BUTTON_PROPS}
                                        >
                                            {t("users:bulkActions.revokeFromSelected")}
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

export default BulkPermissionGrantDialog;
