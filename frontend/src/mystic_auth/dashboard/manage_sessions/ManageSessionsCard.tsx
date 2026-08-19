import React, { useEffect, useState } from "react";
import { Badge, Heading, HStack, Text } from "@chakra-ui/react";
import type { CardRootProps } from "@chakra-ui/react";
import { Eye, MonitorOff } from "lucide-react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import Card from "../../ui/Card";
import DataTable, { type DataTableColumn } from "../../ui/DataTable/DataTable";
import TableActionButton from "../../ui/table_actions/TableActionButton";
import TableActionIconButton from "../../ui/table_actions/TableActionIconButton";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { toaster } from "../../ui/toaster/toasterInstance";
import { useLogoutMutation } from "../../auth/logout/useLogoutMutation";
import { formatDateTime } from "../../ui/dateFormat";
import { useLanguageStore } from "../../store/languageStore";
import { parseUserAgent } from "./parseUserAgent";
import { useSessionsQuery } from "./useSessionsQuery";
import { useRevokeSessionMutation } from "./useRevokeSessionMutation";
import SessionDetailsDialog from "./SessionDetailsDialog";
import type { SessionRead } from "../../api/auth_api";

/**
 * ManageSessionsCard
 * ----------------------------
 * Lists the caller's own active login sessions (GET /auth/sessions) as a
 * table (device/browser, location, first-signed-in, last-seen, an action
 * column), same shape as every other management list in the app, since this
 * list can grow just like those do. IP address isn't a column - it's fixed
 * width real estate a table this narrow can't spare, so it only shows in the
 * per-row "View" action's SessionDetailsDialog, alongside everything else.
 * Every row gets its own working "Log out", including the current device's
 * row ("This device" badge): that one goes through the
 * ordinary single-device logout (POST /auth/logout, same as the navbar's
 * Logout button) rather than DELETE /auth/sessions/{id} - the backend
 * rejects revoking your own current session that way (it would invalidate
 * the very request doing it), so the current row's button intentionally
 * takes the other, already-safe path instead of just being disabled.
 *
 * Lives in its own `manage_sessions/` feature folder (mirroring the
 * backend's `auth/manage_sessions/` + `user_session/`), not under
 * `dashboard/`: this is session-management domain logic that happens to be
 * rendered on the Dashboard page, not something owned by the dashboard
 * feature itself.
 */
const ManageSessionsCard: React.FC<CardRootProps> = ({ ...cardProps }) => {
    const { t } = useTranslation("dashboard");
    // See AllAuthorizationLogSection.tsx's matching comment: dates use
    // chromeLanguage, not pageLanguage.
    const language = useLanguageStore((s) => s.chromeLanguage);
    const { data: sessions, isLoading, isError } = useSessionsQuery();
    const [endingSession, setEndingSession] = useState<SessionRead | null>(null);
    const [viewingSession, setViewingSession] = useState<SessionRead | null>(null);
    const revokeMutation = useRevokeSessionMutation();
    const logoutMutation = useLogoutMutation();
    const navigate = useNavigate();

    // isSuccess OR isError: useLogoutMutation clears local auth state in
    // onSettled regardless of outcome (see its own comment - a
    // NO_REFRESH_TOKEN_COOKIE 400 is a real, reachable response), so
    // navigation must follow every settled mutation, not just a successful
    // one, or ending "This device"'s row here leaves the user stuck on this
    // now-stale page instead of redirecting to /login.
    useEffect(() => {
        if (logoutMutation.isSuccess || logoutMutation.isError) navigate("/login");
    }, [logoutMutation.isSuccess, logoutMutation.isError, navigate]);

    const handleConfirm = () => {
        if (!endingSession) return;

        if (endingSession.is_current) {
            logoutMutation.mutate();
            setEndingSession(null);
            return;
        }

        revokeMutation.mutate(endingSession.id, {
            onSuccess: () => {
                toaster.create({ title: t("manageSessions.sessionEndedToast"), type: "success" });
                setEndingSession(null);
            },
            onError: (error) => {
                toaster.create({ title: error.message, type: "error" });
                setEndingSession(null);
            },
        });
    };

    const columns: DataTableColumn<SessionRead>[] = [
        {
            key: "device",
            header: t("manageSessions.deviceColumn"),
            width: "13.75rem",
            render: (s) => {
                const label = parseUserAgent(s.user_agent);
                return (
                    <HStack gap={2} overflow="hidden">
                        <Text fontWeight="medium" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={label}>
                            {label}
                        </Text>
                        {s.is_current && (
                            <Badge colorPalette="brand" variant="subtle" flexShrink={0} size="md">
                                {t("manageSessions.thisDeviceBadge")}
                            </Badge>
                        )}
                    </HStack>
                );
            },
        },
        {
            key: "location",
            header: t("manageSessions.locationColumn"),
            width: "10rem",
            truncate: true,
            render: (s) => {
                const label = [s.city, s.country].filter(Boolean).join(", ");
                return label || t("manageSessions.locationUnknown");
            },
        },
        {
            key: "created_at",
            header: t("manageSessions.signedInColumn"),
            width: "11.875rem",
            truncate: true,
            // Matches the enlarged date stats in the Welcome card right
            // above this table - the table's own default cell text
            // read noticeably smaller sitting directly under those.
            render: (s) => <Text fontSize="md">{formatDateTime(s.created_at, language)}</Text>,
        },
        {
            key: "last_used_at",
            header: t("manageSessions.lastSeenColumn"),
            width: "11.875rem",
            truncate: true,
            render: (s) => <Text fontSize="md">{formatDateTime(s.last_used_at, language)}</Text>,
        },
        {
            key: "row_actions",
            header: "",
            align: "end",
            width: "10.625rem",
            render: (s) => (
                <HStack justify="flex-end" gap={1.5} wrap="nowrap">
                    <TableActionIconButton colorPalette="blue" label={t("manageSessions.viewButton")} onClick={() => setViewingSession(s)}>
                        <Eye size={16} aria-hidden="true" />
                    </TableActionIconButton>
                    <TableActionButton
                        colorPalette="red"
                        onClick={() => setEndingSession(s)}
                        loading={
                            (s.is_current && logoutMutation.isPending) ||
                            (!s.is_current && revokeMutation.isPending && revokeMutation.variables === s.id)
                        }
                    >
                        {t("manageSessions.logOut")}
                    </TableActionButton>
                </HStack>
            ),
        },
    ];

    return (
        <Card p="density.cardPadding" {...cardProps}>
            <Heading as="h2" size="md" mb={4} textStyle="sectionHeader">
                {t("manageSessions.heading")}
            </Heading>

            <DataTable
                columns={columns}
                rows={sessions}
                rowKey={(s) => s.id}
                isLoading={isLoading}
                isError={isError}
                errorMessage={t("manageSessions.errorLoadSessions")}
                emptyMessage={t("manageSessions.noActiveSessions")}
                emptyIcon={<MonitorOff size={32} aria-hidden="true" />}
                startIndex={0}
            />

            <SessionDetailsDialog isOpen={!!viewingSession} session={viewingSession} onClose={() => setViewingSession(null)} />

            <ConfirmDialog
                isOpen={!!endingSession}
                title={endingSession?.is_current ? t("manageSessions.endDialog.logoutThisDeviceTitle") : t("manageSessions.endDialog.endSessionTitle")}
                description={
                    endingSession?.is_current
                        ? t("manageSessions.endDialog.logoutThisDeviceDescription")
                        : t("manageSessions.endDialog.endSessionDescription", {
                              device: parseUserAgent(endingSession?.user_agent ?? null),
                              ipSuffix: endingSession?.ip_address ? ` (${endingSession.ip_address})` : "",
                          })
                }
                confirmLabel={t("manageSessions.endDialog.confirmLabel")}
                isLoading={endingSession?.is_current ? logoutMutation.isPending : revokeMutation.isPending}
                onConfirm={handleConfirm}
                onCancel={() => setEndingSession(null)}
            />
        </Card>
    );
};

export default ManageSessionsCard;
