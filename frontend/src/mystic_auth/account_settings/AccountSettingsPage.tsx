import React, { useState } from "react";
import { Box, Tabs } from "@chakra-ui/react";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import PageContainer from "../ui/PageContainer";
import { useAuthStore } from "../store/authStore";
import ProfileNameCard from "./ProfileNameCard";
import ChangePasswordCard from "./ChangePasswordCard";
import AccountStatusCard from "./AccountStatusCard";
import DeleteAccountCard from "./DeleteAccountCard";
import { useUnsavedChangesWarning } from "./useUnsavedChangesWarning";

/**
 * Extra tabs an app can append after the four built-in ones below, same
 * "typed, optional, additive" shape as AppLayout's `extraNavItems`/
 * `extraNavbarContent` (see
 * docs/mystic_auth/template-usage/overview.md#shared-chrome-extension-points).
 * `value` must be unique among both built-in and app-supplied tabs - it's
 * the Tabs.Trigger/Tabs.Content pairing key, not just a label.
 */
export interface AccountSettingsExtraTab {
    value: string;
    label: string;
    content: React.ReactNode;
}

interface AccountSettingsPageProps {
    /** Appended after the built-in Profile/Password/Account Status/Danger
     * Zone tabs, in the order given. Optional - omitting it renders exactly
     * the four built-in tabs, same as before this prop existed. */
    extraTabs?: AccountSettingsExtraTab[];
}

/**
 * AccountSettingsPage (nav label/route: "Account Settings")
 * ----------------------------
 * Self-service account management: rename your own account, change/set your
 * password, and see your own effective policies (GET /authorization/users/
 * me/policies) - name and/or password both PUT /users/me, via two
 * independent forms/cards, see below. Deliberately doesn't repeat email/role/
 * member-since/session-count: DashboardPage already shows those as read-only
 * context, so this page only holds what's actually actionable here. No
 * permission required beyond authentication: this is exactly the
 * self-service surface users:read_own/users:update_own exist for.
 *
 * Composes four independent widgets, each its own tab: ProfileNameCard
 * (name), ChangePasswordCard (password), AccountStatusCard (read-only
 * password status + policy list), and DeleteAccountCard (self-service
 * account deletion, DELETE /users/me). This page only owns what has to live
 * above all four: the combined unsaved-changes warning, since from the
 * user's perspective "I have unsaved changes" doesn't care which tab they're
 * in - switching tabs (not just leaving the page) doesn't discard either
 * card's own in-progress edit either, since `lazyMount` (without
 * `unmountOnExit`) mounts a tab's content on first visit and then leaves it
 * mounted-but-hidden, rather than tearing down and losing whatever the user
 * typed there. DeleteAccountCard is deliberately excluded from the dirty
 * tracking above: its password field isn't an in-progress edit worth warning
 * about losing, and its own ConfirmDialog step is warning enough before
 * anything destructive actually happens.
 */
const AccountSettingsPage: React.FC<AccountSettingsPageProps> = ({ extraTabs }) => {
    const { t } = useTranslation("account_settings");
    const name = useAuthStore((s) => s.name);
    const hasPassword = useAuthStore((s) => s.hasPassword);

    const [nameDirty, setNameDirty] = useState(false);
    const [passwordDirty, setPasswordDirty] = useState(false);
    useUnsavedChangesWarning(nameDirty || passwordDirty);

    // Read-once initializer, not a synced-both-ways URL param - same
    // reasoning as UsersPage's `?search=` deep link. CommandPalette's
    // content-search results (layout/command_palette/searchItems.ts) navigate to e.g.
    // /account-settings?tab=password to land on a specific tab; `key` below
    // forces Tabs.Root to pick up a new `initialTab` on a fresh deep-link
    // navigation while leaving normal in-page tab clicks (which never touch
    // the URL) alone, so switching tabs by hand still doesn't lose whatever
    // you were mid-typing in another tab (see this component's own docstring).
    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get("tab") ?? "profile";

    return (
        <PageContainer title={t("pageTitle")} icon={Settings} description={t("pageDescription")}>
            <Tabs.Root key={initialTab} defaultValue={initialTab} lazyMount>
                <Tabs.List>
                    <Tabs.Trigger value="profile" fontSize="md">{t("tabs.profile")}</Tabs.Trigger>
                    <Tabs.Trigger value="password" fontSize="md">{t("tabs.password")}</Tabs.Trigger>
                    <Tabs.Trigger value="status" fontSize="md">{t("tabs.status")}</Tabs.Trigger>
                    <Tabs.Trigger
                        value="danger"
                        fontSize="md"
                        colorPalette="red"
                        color="red.600"
                        _dark={{ color: "red.400" }}
                        _selected={{ color: "red.600", _dark: { color: "red.400" } }}
                    >
                        {t("tabs.danger")}
                    </Tabs.Trigger>
                    {extraTabs?.map((tab) => (
                        <Tabs.Trigger key={tab.value} value={tab.value} fontSize="md">
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
                    <Box maxW="lg">
                        <AccountStatusCard hasPassword={hasPassword} />
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
