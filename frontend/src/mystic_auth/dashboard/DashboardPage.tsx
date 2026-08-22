import React, { useEffect, useState } from "react";
import { Container, Stack } from "@chakra-ui/react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

// Reuses the same TanStack Query cache entry that useAuthSession() (called
// once at the app root) already populates, so this page doesn't duplicate
// the GET /auth/me network call or its own loading/error state machine.
import { useCurrentUserQuery } from "../auth/current_user/useCurrentUserQuery";
import { useLogoutAllMutation } from "../auth/logout_all/useLogoutAllMutation";
import { useLastLoginQuery } from "./useLastLoginQuery";
import { useLanguageStore } from "../store/languageStore";
import ManageSessionsCard from "./manage_sessions/ManageSessionsCard";

import Card from "../ui/Card";
import DashboardIdentityCard from "./DashboardIdentityCard";
import ConfirmDialog from "../ui/ConfirmDialog";
import ProfileDetailsDialog from "./ProfileDetailsDialog";

/**
 * DashboardPage
 * ----------------------------
 * Displays the current user's information. Reads the current user from the
 * shared useCurrentUserQuery cache instead of fetching independently, so it
 * stays in sync with the rest of the app. Session controls (logout, logout
 * all devices) live in the app shell (Navbar) and AccountSettingsPage too; the
 * Logout All quick action below is a shortcut to that same flow, not a
 * separate implementation of it.
 *
 * Data-fetching and dialog orchestration only - the identity card's own
 * presentation (loaded and skeleton states) lives in DashboardIdentityCard /
 * DashboardIdentityCardSkeleton.
 */
const DashboardPage: React.FC = () => {
    const { t } = useTranslation("dashboard");
    // See AllAuthorizationLogSection.tsx's matching comment: dates use
    // chromeLanguage, not pageLanguage.
    const language = useLanguageStore((s) => s.chromeLanguage);
    const { data: user, isLoading, isError } = useCurrentUserQuery();
    const { data: lastLoginAt } = useLastLoginQuery();
    const navigate = useNavigate();

    const logoutAllMutation = useLogoutAllMutation();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [profileDialogOpen, setProfileDialogOpen] = useState(false);

    // isSuccess OR isError: useLogoutAllMutation clears local auth state in
    // onSettled regardless of outcome (see its own comment for why - a
    // NO_REFRESH_TOKEN_COOKIE 400 is a real, reachable response here), so
    // navigation must follow every settled mutation, not just a successful
    // one, or a failed call leaves the user stuck on this now-stale page.
    useEffect(() => {
        if (logoutAllMutation.isSuccess || logoutAllMutation.isError) navigate("/login");
    }, [logoutAllMutation.isSuccess, logoutAllMutation.isError, navigate]);

    return (
        <Container maxW="8xl">
            <Stack gap={6}>
            {/* Both cards are full-width and laid out as a horizontal row of
                sections (identity, stats, actions) rather than the previous
                narrow 340px column stacked vertically down the page - a
                short, wide banner reads faster than a tall one, and it
                matches the Manage Sessions table below it, which is
                already wide/horizontal by nature. */}
            <Card p={7} color="fg.default">
                <DashboardIdentityCard
                    user={user}
                    isLoading={isLoading}
                    isError={isError}
                    lastLoginAt={lastLoginAt ?? undefined}
                    language={language}
                    logoutAllPending={logoutAllMutation.isPending}
                    logoutAllErrorMessage={logoutAllMutation.isError ? logoutAllMutation.error.message : undefined}
                    onOpenProfileDialog={() => setProfileDialogOpen(true)}
                    onNavigateToAccountSettings={() => navigate("/account-settings")}
                    onRequestLogoutAll={() => setConfirmOpen(true)}
                />
            </Card>

            {/* id target for CommandPalette's "Manage Sessions" content-search
                result (see layout/command_palette/searchItems.ts) - AppLayout's
                useScrollToHash scrolls here after navigating in on
                /dashboard#manage-sessions. */}
            <ManageSessionsCard id="manage-sessions" />
            </Stack>

            <ConfirmDialog
                isOpen={confirmOpen}
                title={t("logoutAllDialog.title")}
                description={t("logoutAllDialog.description")}
                confirmLabel={t("logoutAllDialog.confirmLabel")}
                isLoading={logoutAllMutation.isPending}
                onConfirm={() => {
                    logoutAllMutation.mutate();
                    setConfirmOpen(false);
                }}
                onCancel={() => setConfirmOpen(false)}
            />

            <ProfileDetailsDialog
                isOpen={profileDialogOpen}
                user={user ?? null}
                onClose={() => setProfileDialogOpen(false)}
            />
        </Container>
    );
};

export default DashboardPage;
