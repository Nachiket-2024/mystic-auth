import React from "react";
import { Button, Dialog, Portal, Stack, Text } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import Badge from "../../ui/Badge";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../../ui/styles/dialogStyles";
import { CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../../ui/styles/buttonStyles";
import { formatDateTime } from "../../ui/dateFormat";
import { useLanguageStore } from "../../store/languageStore";
import { parseUserAgent } from "./parseUserAgent";
import type { SessionRead } from "../../api/auth_api";

interface SessionDetailsDialogProps {
    isOpen: boolean;
    session: SessionRead | null;
    onClose: () => void;
}

interface DetailRowProps {
    label: string;
    children: React.ReactNode;
}

/** Same label/value layout as UserDetailsDialog.tsx's own DetailRow - the
 * whole point of this dialog is showing what the table's truncated/dropped
 * columns (ip_address isn't even a column anymore) cut off, so nothing here
 * should re-truncate. */
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
 * SessionDetailsDialog
 * ----------------------------
 * Read-only "View" panel for one session's full device/IP/location/date
 * info - everything ManageSessionsCard's own table no longer shows at all
 * (ip_address) or truncates (location, dates) for table-width reasons. Pure
 * display surface, same shape as users/UserDetailsDialog.tsx: takes the
 * already-fetched row object directly, no separate query.
 */
const SessionDetailsDialog: React.FC<SessionDetailsDialogProps> = ({ isOpen, session, onClose }) => {
    const { t } = useTranslation(["dashboard", "ui_text"]);
    const language = useLanguageStore((s) => s.chromeLanguage);
    if (!session) return null;

    const locationLabel = [session.city, session.country].filter(Boolean).join(", ");

    return (
        <Dialog.Root open={isOpen} onOpenChange={(details) => !details.open && onClose()} closeOnInteractOutside>
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                    <Dialog.Content {...DIALOG_CONTENT_PROPS}>
                        <Dialog.Header>
                            <Dialog.Title>{t("dashboard:manageSessions.detailsDialog.title")}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <Stack gap={4}>
                                <DetailRow label={t("dashboard:manageSessions.detailsDialog.device")}>
                                    {parseUserAgent(session.user_agent)}
                                    {session.is_current && (
                                        <Badge colorPalette="brand" variant="subtle" size="md" ml={2}>
                                            {t("dashboard:manageSessions.thisDeviceBadge")}
                                        </Badge>
                                    )}
                                </DetailRow>
                                <DetailRow label={t("dashboard:manageSessions.detailsDialog.ipAddress")}>
                                    {session.ip_address ?? t("dashboard:manageSessions.ipUnknown")}
                                </DetailRow>
                                <DetailRow label={t("dashboard:manageSessions.detailsDialog.location")}>
                                    {locationLabel || t("dashboard:manageSessions.locationUnknown")}
                                </DetailRow>
                                <DetailRow label={t("dashboard:manageSessions.detailsDialog.signedIn")}>
                                    {formatDateTime(session.created_at, language)}
                                </DetailRow>
                                <DetailRow label={t("dashboard:manageSessions.detailsDialog.lastSeen")}>
                                    {formatDateTime(session.last_used_at, language)}
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

export default SessionDetailsDialog;
