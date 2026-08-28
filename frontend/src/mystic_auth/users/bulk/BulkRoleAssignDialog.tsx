import React, { useState } from "react";
import { Box, Button, Dialog, HStack, Portal, Stack, Text } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useBulkUpdateRoleMutation } from "../../policies/queries/bulkAssignmentMutations";
import StyledSelect from "../../ui/StyledSelect";
import BulkOperationResultList from "./BulkOperationResultList";
import { ROLE_OPTIONS, capitalize } from "../usersColumns";
import { toaster } from "../../ui/toaster/toasterInstance";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../../ui/styles/dialogStyles";
import { BRAND_SOLID_HOVER_PROPS, CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

interface BulkRoleAssignDialogProps {
    isOpen: boolean;
    userEmails: string[];
    onClose: () => void;
}

/** Sets the (display/grouping-only, non-PBAC) role metadata field for every
 * user in `userEmails` at once. The per-item safeguards (a system-role
 * target can't be changed, assigning `system` needs
 * users:assign_system_role) are enforced server-side per item - this
 * dialog just surfaces whatever the backend reports back per user. */
const BulkRoleAssignDialog: React.FC<BulkRoleAssignDialogProps> = ({ isOpen, userEmails, onClose }) => {
    const { t } = useTranslation(["users", "ui_text"]);
    const [role, setRole] = useState("");

    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) setRole("");
    }

    const roleMutation = useBulkUpdateRoleMutation();

    // See BulkPolicyAssignDialog's identical comment: react-query mutations
    // keep their last `.data` around across remounts otherwise, so a
    // reopened dialog showed the previous run's success summary again
    // before this run had done anything.
    if (isOpen !== prevIsOpen && isOpen) {
        roleMutation.reset();
    }

    const handleSetRole = () => {
        if (!role) return;
        roleMutation.mutate(
            { userEmails, role },
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
                            <Dialog.Title>{t("users:bulkActions.setRoleDialogTitle", { count: userEmails.length })}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Stack gap={4}>
                                <StyledSelect
                                    w="full"
                                    value={role}
                                    onChange={setRole}
                                    ariaLabel={t("users:bulkActions.selectRoleAriaLabel")}
                                    options={[
                                        { value: "", label: t("users:bulkActions.selectRole") },
                                        ...ROLE_OPTIONS.map((r) => ({ value: r, label: capitalize(r) })),
                                    ]}
                                />
                                <HStack>
                                    <Button
                                        size="sm"
                                        colorPalette="brand"
                                        onClick={handleSetRole}
                                        disabled={!role}
                                        loading={roleMutation.isPending}
                                        {...BRAND_SOLID_HOVER_PROPS}
                                    >
                                        {t("users:bulkActions.setRoleForSelected")}
                                    </Button>
                                </HStack>
                                {roleMutation.data && (
                                    <Box>
                                        <Text fontSize="sm" fontWeight="medium" mb={1}>
                                            {t("users:bulkActions.resultSummary", {
                                                success: roleMutation.data.success_count,
                                                error: roleMutation.data.error_count,
                                            })}
                                        </Text>
                                        <BulkOperationResultList results={roleMutation.data.results} />
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

export default BulkRoleAssignDialog;
