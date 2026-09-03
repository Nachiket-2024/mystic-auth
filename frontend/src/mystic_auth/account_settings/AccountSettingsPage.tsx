import React, { useState } from "react";
import { Box, Heading, HStack, Tabs, Text } from "@chakra-ui/react";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import PageContainer from "../ui/PageContainer";
import Card from "../ui/Card";
import AuthInlineLink from "../ui/AuthInlineLink";
import { useAuthStore } from "../store/authStore";
import ProfileNameCard from "./ProfileNameCard";
import ChangePasswordCard from "./ChangePasswordCard";
import AccountStatusCard from "./AccountStatusCard";
import AppearanceCard from "./AppearanceCard";
import DeleteAccountCard from "./DeleteAccountCard";
import { useUnsavedChangesWarning } from "./useUnsavedChangesWarning";

/**
 * Extra tabs an app can append after the built-in ones, same "typed,
 * optional, additive" shape as AppLayout's `extraNavItems`/
 * `extraNavbarContent` (see
     * docs/mystic_auth/template-usage/frontend-customization.md#shared-chrome-extension-points).
 * `value` must be unique among built-in and app-supplied tabs: it's the
 * Tabs.Trigger/Tabs.Content pairing key, not just a label.
 */
export interface AccountSettingsExtraTab {
    value: string;
    label: string;
    content: React.ReactNode;
}

interface AccountSettingsPageProps {
    /** Appended after the built-in tabs, in the order given. Optional: omitting
     * it renders just the built-in tabs. */
    extraTabs?: AccountSettingsExtraTab[];
}

/**
 * AccountSettingsPage (nav label/route: "Account Settings")
 * ----------------------------
 * Self-service account management: rename your own account, change/set your
 * password, and see your own effective policies. Name and password both go
 * through PUT /users/me, via two independent forms/cards below. Doesn't
 * repeat email/role/member-since/session-count since DashboardPage already
 * shows those as read-only context. No permission required beyond
 * authentication: this is the self-service surface users:read_own/
 * users:update_own exist for.
 *
 * Composes five independent widgets, each its own tab: ProfileNameCard
 * (name), ChangePasswordCard (password, including whether one is set),
 * AccountStatusCard (read-only policy/permission list), a Legal tab (Privacy
 * Policy/Terms of Service links, the only way to reach either once signed
 * in), and DeleteAccountCard (self-service deletion, DELETE /users/me),
 * kept last since it's destructive. This page only owns what has to live
 * above all of them: a combined unsaved-changes warning, since switching
 * tabs shouldn't discard an in-progress edit on another tab. `lazyMount`
 * (without `unmountOnExit`) keeps a visited tab mounted-but-hidden instead of
 * tearing it down, which is what makes that possible. DeleteAccountCard is
 * excluded from the dirty tracking: its password field isn't an edit worth
 * warning about losing, and its own ConfirmDialog is warning enough already.
 */
const AccountSettingsPage: React.FC<AccountSettingsPageProps> = ({ extraTabs }) => {
    const { t } = useTranslation(["account_settings", "layout"]);
    const name = useAuthStore((s) => s.name);
    const hasPassword = useAuthStore((s) => s.hasPassword);

    const [nameDirty, setNameDirty] = useState(false);
    const [passwordDirty, setPasswordDirty] = useState(false);
    useUnsavedChangesWarning(nameDirty || passwordDirty);

    // Read-once initializer, not a synced-both-ways URL param (same as UsersPage's
    // `?search=` deep link). CommandPalette navigates to e.g.
    // /account-settings?tab=password to land on a specific tab; `key` below
    // forces Tabs.Root to pick up a new `initialTab` on a fresh deep link
    // while leaving normal in-page tab clicks (which don't touch the URL)
    // alone, so manual tab switches still don't lose an in-progress edit.
    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get("tab") ?? "profile";

    return (
        <PageContainer title={t("pageTitle")} icon={Settings} description={t("pageDescription")}>
            <Tabs.Root key={initialTab} defaultValue={initialTab} lazyMount>
                {/* Six built-in tabs (more with extraTabs) don't fit a phone-width
                    viewport at natural size. Without a scroll container, Chakra's
                    Tabs.List shrinks each trigger below its own text width instead
                    of wrapping, so labels overlap and become unreadable (same fix
                    as BulkActionToolbar.tsx on the Users page). overflowX="auto"
                    plus flexShrink={0}/whiteSpace="nowrap" on each trigger turns
                    this into a horizontally scrollable strip instead. -mx/px cancel
                    out so the strip still lines up with PageContainer's edges. */}
                <Tabs.List overflowX="auto" flexWrap="nowrap" mx={-4} px={4}>
                    <Tabs.Trigger value="profile" fontSize="md" flexShrink={0} whiteSpace="nowrap">{t("tabs.profile")}</Tabs.Trigger>
                    <Tabs.Trigger value="password" fontSize="md" flexShrink={0} whiteSpace="nowrap">{t("tabs.password")}</Tabs.Trigger>
                    <Tabs.Trigger value="status" fontSize="md" flexShrink={0} whiteSpace="nowrap">{t("tabs.status")}</Tabs.Trigger>
                    <Tabs.Trigger value="appearance" fontSize="md" flexShrink={0} whiteSpace="nowrap">{t("tabs.appearance")}</Tabs.Trigger>
                    <Tabs.Trigger value="legal" fontSize="md" flexShrink={0} whiteSpace="nowrap">{t("tabs.legal")}</Tabs.Trigger>
                    <Tabs.Trigger
                        value="danger"
                        fontSize="md"
                        flexShrink={0}
                        whiteSpace="nowrap"
                        colorPalette="red"
                        color="red.600"
                        _dark={{ color: "red.400" }}
                        _selected={{ color: "red.600", _dark: { color: "red.400" } }}
                    >
                        {t("tabs.danger")}
                    </Tabs.Trigger>
                    {extraTabs?.map((tab) => (
                        <Tabs.Trigger key={tab.value} value={tab.value} fontSize="md" flexShrink={0} whiteSpace="nowrap">
                            {tab.label}
                        </Tabs.Trigger>
                    ))}
                </Tabs.List>

                <Tabs.Content value="profile">
                    <Box maxW="lg">
                        <ProfileNameCard name={name} onDirtyChange={setNameDirty} />
                    </Box>
                </Tabs.Content>

                <Tabs.Content value="password">
                    <Box maxW="3xl">
                        <ChangePasswordCard hasPassword={hasPassword} onDirtyChange={setPasswordDirty} />
                    </Box>
                </Tabs.Content>

                <Tabs.Content value="status">
                    {/* Unlike the other tabs, this one keeps the page's full width
                        (same as Users/Policies): the right column's
                        effective-permissions badge list is open-ended and often the
                        longest thing on the page, so it gets all the width
                        PageContainer's maxW="container.xl" allows. See
                        AccountStatusCard's docstring for its own column split. */}
                    <AccountStatusCard />
                </Tabs.Content>

                <Tabs.Content value="appearance">
                    <Box maxW="3xl">
                        <AppearanceCard />
                    </Box>
                </Tabs.Content>

                {/* Its own tab (not a page footer) so it reads as another
                    self-contained settings section, reachable without leaving the
                    tab strip. Ordered before Danger Zone so the destructive
                    action stays last. */}
                <Tabs.Content value="legal">
                    <Box maxW="lg">
                        <Card p={5}>
                            <Heading as="h2" size="lg" mb={3} textStyle="sectionHeader">
                                {t("tabs.legal")}
                            </Heading>
                            <HStack gap={2}>
                                <AuthInlineLink to="/privacy" fontSize="md">
                                    {t("footer.privacyPolicy", { ns: "layout" })}
                                </AuthInlineLink>
                                <Text fontSize="md" color="fg.muted">
                                    &middot;
                                </Text>
                                <AuthInlineLink to="/terms" fontSize="md">
                                    {t("footer.termsOfService", { ns: "layout" })}
                                </AuthInlineLink>
                            </HStack>
                        </Card>
                    </Box>
                </Tabs.Content>

                <Tabs.Content value="danger">
                    <Box maxW="lg">
                        <DeleteAccountCard hasPassword={hasPassword} />
                    </Box>
                </Tabs.Content>

                {extraTabs?.map((tab) => (
                    <Tabs.Content key={tab.value} value={tab.value}>
                        {tab.content}
                    </Tabs.Content>
                ))}
            </Tabs.Root>
        </PageContainer>
    );
};

export default AccountSettingsPage;
