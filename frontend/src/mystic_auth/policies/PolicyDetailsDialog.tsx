import React from "react";
import { Button, Dialog, Portal, SimpleGrid, Stack, Text, Wrap } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import Badge from "../ui/Badge";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../ui/styles/dialogStyles";
import { CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../ui/styles/buttonStyles";
import { formatDateTime } from "../ui/dateFormat";
import { useLanguageStore } from "../store/languageStore";
import type { PolicyRead } from "../api/policies_api";

interface PolicyDetailsDialogProps {
    isOpen: boolean;
    policy: PolicyRead | null;
    onClose: () => void;
}

interface DetailRowProps {
    label: string;
    children: React.ReactNode;
}

/** Same label/value layout as users/UserDetailsDialog.tsx's own DetailRow -
 * this dialog exists to show what the table's own Name/Actions columns
 * truncate (see DataTable.tsx's `truncate` columns and PoliciesPage.tsx's
 * fixed-width actions column), so nothing here should re-truncate. */
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
 * PolicyDetailsDialog
 * ----------------------------
 * Read-only "View" panel for one policy's full name/description/actions/
 * conditions - everything PoliciesPage's own table truncates or hides
 * (conditions isn't a column at all). Pure display surface, same shape as
 * users/UserDetailsDialog.tsx: takes the already-fetched row object
 * directly, no separate query.
 */
const PolicyDetailsDialog: React.FC<PolicyDetailsDialogProps> = ({ isOpen, policy, onClose }) => {
    const { t } = useTranslation(["policies", "ui_text"]);
    const language = useLanguageStore((s) => s.chromeLanguage);
    if (!policy) return null;

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={(details) => !details.open && onClose()}
            size="xl"
            closeOnInteractOutside
        >
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                    <Dialog.Content {...DIALOG_CONTENT_PROPS}>
                        <Dialog.Header>
                            <Dialog.Title>{t("policies:detailsDialog.title")}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Stack gap={4}>
                                {/* Short fields pair up two-per-row at this width (size="xl"
                                    above) instead of each claiming a full row, so a policy
                                    with many actions (e.g. system_superuser's 18) has enough
                                    headroom left in the body to show every badge without the
                                    dialog needing its own internal scroll. */}
                                <SimpleGrid columns={2} gap={4}>
                                    <DetailRow label={t("policies:detailsDialog.name")}>{policy.name}</DetailRow>
                                    <DetailRow label={t("policies:detailsDialog.resourceType")}>{policy.resource_type}</DetailRow>
                                </SimpleGrid>
                                <DetailRow label={t("policies:detailsDialog.description")}>
                                    <Text as="span" color={policy.description ? undefined : "fg.muted"}>
                                        {policy.description || t("policies:detailsDialog.noDescription")}
                                    </Text>
                                </DetailRow>
                                <DetailRow label={t("policies:detailsDialog.actions")}>
                                    <Wrap gap={1}>
                                        {policy.actions.map((a) => (
                                            <Badge key={a} colorPalette="brand" variant="subtle" fontSize="md" px={2} py={0.5}>
                                                {a}
                                            </Badge>
                                        ))}
                                    </Wrap>
                                </DetailRow>
                                <DetailRow label={t("policies:detailsDialog.conditions")}>
                                    {policy.conditions ? (
                                        <Text as="pre" fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap">
                                            {JSON.stringify(policy.conditions, null, 2)}
                                        </Text>
                                    ) : (
                                        <Text as="span" color="fg.muted">{t("policies:detailsDialog.noConditions")}</Text>
                                    )}
                                </DetailRow>
                                <SimpleGrid columns={{ base: 1, sm: 3 }} gap={4}>
                                    <DetailRow label={t("policies:detailsDialog.status")}>
                                        {policy.is_active ? (
                                            <Badge colorPalette="green" size="md">{t("policies:detailsDialog.active")}</Badge>
                                        ) : (
                                            <Badge colorPalette="gray" size="md">{t("ui_text:inactive")}</Badge>
                                        )}
                                    </DetailRow>
                                    <DetailRow label={t("policies:detailsDialog.created")}>{formatDateTime(policy.created_at, language)}</DetailRow>
                                    <DetailRow label={t("policies:detailsDialog.lastUpdated")}>{formatDateTime(policy.updated_at, language)}</DetailRow>
                                </SimpleGrid>
                                {policy.created_by && (
                                    <DetailRow label={t("policies:detailsDialog.createdBy")}>{policy.created_by}</DetailRow>
                                )}
                            </Stack>
                        </Dialog.Body>
                        <Dialog.Footer>
                            <Button onClick={onClose} {...SECONDARY_BUTTON_PROPS}>
                                {t("ui_text:close")}
                            </Button>
                        </Dialog.Footer>
                        {/* Chakra v3's Dialog.CloseTrigger renders no icon of its own
                            (unlike v2) - without explicit children it was an empty
                            0x0 button, invisible to every user, not just screen
                            readers (axe-core button-name audit). */}
                        <Dialog.CloseTrigger aria-label={t("ui_text:closeDialog")} {...CLOSE_TRIGGER_PROPS}>
                            <X size={16} aria-hidden="true" />
                        </Dialog.CloseTrigger>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    );
};

export default PolicyDetailsDialog;
