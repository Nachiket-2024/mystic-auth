import React from "react";
import { Button, Dialog, Portal, Stack, Text } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import Badge from "../ui/Badge";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../ui/styles/dialogStyles";
import { CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../ui/styles/buttonStyles";
import type { PermissionCatalogEntry } from "../api/permissions_api";

interface PermissionDetailsDialogProps {
    isOpen: boolean;
    entry: PermissionCatalogEntry | null;
    onClose: () => void;
}

interface DetailRowProps {
    label: string;
    children: React.ReactNode;
}

/** Same label/value layout as policies/dialogs/PolicyDetailsDialog.tsx's own
 * DetailRow - shows what the table's own Description column truncates. */
const DetailRow: React.FC<DetailRowProps> = ({ label, children }) => (
    <Stack gap={0.5}>
        <Text fontSize="sm" fontWeight="semibold" textTransform="uppercase" letterSpacing="wide" color="fg.muted">
            {label}
        </Text>
        <Text as="div" fontSize="md" wordBreak="break-word">
            {children}
        </Text>
    </Stack>
);

/**
 * PermissionDetailsDialog
 * ----------------------------
 * Read-only "View" panel for one permission catalog entry's full action/
 * resource type/description - same shape as policies/dialogs/PolicyDetailsDialog.tsx,
 * sized down since a catalog entry has no name, status, or timestamps of its
 * own. Pure display surface: takes the already-fetched row object directly,
 * no separate query.
 */
const PermissionDetailsDialog: React.FC<PermissionDetailsDialogProps> = ({ isOpen, entry, onClose }) => {
    const { t } = useTranslation(["permissions", "ui_text"]);
    if (!entry) return null;

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={(details) => !details.open && onClose()}
            size="md"
            closeOnInteractOutside
        >
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                    <Dialog.Content {...DIALOG_CONTENT_PROPS}>
                        <Dialog.Header>
                            <Dialog.Title>{t("permissions:detailsDialog.title")}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Stack gap={4}>
                                <DetailRow label={t("permissions:detailsDialog.action")}>
                                    <Badge colorPalette="brand" variant="subtle" fontSize="md" px={2} py={0.5}>
                                        {entry.action}
                                    </Badge>
                                </DetailRow>
                                <DetailRow label={t("permissions:detailsDialog.resourceType")}>
                                    {entry.resource_type}
                                </DetailRow>
                                <DetailRow label={t("permissions:detailsDialog.description")}>
                                    {entry.description}
                                </DetailRow>
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

export default PermissionDetailsDialog;
