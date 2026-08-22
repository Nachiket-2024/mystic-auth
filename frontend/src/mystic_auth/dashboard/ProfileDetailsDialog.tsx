import React from "react";
import { Button, Dialog, HStack, Portal, Stack, Text } from "@chakra-ui/react";
import { ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import Badge from "../ui/Badge";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../ui/styles/dialogStyles";
import { CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../ui/styles/buttonStyles";
import type { CurrentUserProfile } from "../auth/current_user/current_user_types";

interface ProfileDetailsDialogProps {
    isOpen: boolean;
    user: CurrentUserProfile | null;
    onClose: () => void;
}

interface DetailRowProps {
    label: string;
    children: React.ReactNode;
}

/** Same label/value layout as UserDetailsDialog.tsx's/SessionDetailsDialog.tsx's
 * own DetailRow - the whole point of this dialog is showing the identity
 * card's own name/email untruncated, so nothing here should re-truncate. */
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
 * ProfileDetailsDialog
 * ----------------------------
 * Read-only "View" panel for the current user's full name/email/role -
 * DashboardPage.tsx's own identity card truncates all three to a fixed width
 * so a long value can't push its action buttons onto their own line. Same
 * shape as users/UserDetailsDialog.tsx and manage_sessions/SessionDetailsDialog.tsx:
 * takes the already-fetched user object directly, no separate query.
 */
const ProfileDetailsDialog: React.FC<ProfileDetailsDialogProps> = ({ isOpen, user, onClose }) => {
    const { t } = useTranslation(["dashboard", "ui_text"]);
    if (!user) return null;

    return (
        <Dialog.Root open={isOpen} onOpenChange={(details) => !details.open && onClose()} closeOnInteractOutside>
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                    <Dialog.Content {...DIALOG_CONTENT_PROPS}>
                        <Dialog.Header>
                            <Dialog.Title>{t("identityDetailsDialog.title")}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Stack gap={4}>
                                <DetailRow label={t("identityDetailsDialog.name")}>{user.name}</DetailRow>
                                <DetailRow label={t("identityDetailsDialog.email")}>{user.email}</DetailRow>
                                <DetailRow label={t("identityDetailsDialog.role")}>
                                    <HStack gap={1}>
                                        <Badge
                                            colorPalette={user.role ? "brand" : "gray"}
                                            variant="subtle"
                                            px={2.5}
                                            py={1}
                                            fontSize="md"
                                            borderRadius="full"
                                            textTransform="capitalize"
                                            display="inline-flex"
                                            alignItems="center"
                                            gap={1}
                                        >
                                            <ShieldCheck size={14} aria-hidden="true" />
                                            {user.role ?? t("noRole")}
                                        </Badge>
                                    </HStack>
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

export default ProfileDetailsDialog;
