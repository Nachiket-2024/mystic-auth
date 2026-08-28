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
 * Composes five independent widgets, each its own tab: ProfileNameCard
 * (name), ChangePasswordCard (password, including whether one is set),
 * AccountStatusCard (read-only policy/permission list), a Legal tab (Privacy Policy/Terms of
 * Service links - the only way to reach either document once signed in;
 * LoginPage/SignupForm cover a visitor who isn't), and DeleteAccountCard
 * (self-service account deletion, DELETE /users/me) - kept last in the tab
 * strip since it's the destructive one. This page only owns what has to
 * live above all of them: the combined unsaved-changes warning, since from the
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
    const { t } = useTranslation(["account_settings", "layout"]);
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
                {/* Six built-in tabs (more with extraTabs) don't fit a phone-
                    width viewport at their natural size. Without an explicit
                    scroll container, Chakra's Tabs.List just shrinks each
                    trigger below its own text width instead of wrapping -
                    the labels visually overlap each other and become
                    unreadable/impossible to tap accurately (see
                    BulkActionToolbar.tsx for the same class of fix on the
                    Users page). overflowX="auto" plus flexShrink={0}/
                    whiteSpace="nowrap" on every trigger below turns that into
                    a horizontally scrollable strip instead - every tab stays
                    at full readable width and reachable, just off past the
                    edge until scrolled into view. -mx/px cancel out so the
                    scrollable strip still lines up with PageContainer's own
                    edges. */}
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
                    {/* Unlike the other tabs (maxW="3xl"/"lg"), this one is
                        left at the page's own full width (same as Users/
                        Policies, neither of which caps its content either):
                        the right column's effective-permissions badge list
                        is open-ended and routinely the longest thing on this
                        page, so it benefits from every bit of width
                        PageContainer's own maxW="container.xl" already
                        allows, rather than a second, narrower cap on top of
                        it. See AccountStatusCard's own docstring for its
                        internal fit-content(320px) 1fr column split, which
                        gives that room to the right column specifically
                        rather than splitting it evenly. */}
                    <AccountStatusCard />
                </Tabs.Content>

                <Tabs.Content value="appearance">
                    <Box maxW="3xl">
                        <AppearanceCard />
                    </Box>
                </Tabs.Content>

                {/* Its own tab (not a page-level footer) so it reads as one
                    more self-contained settings section like the other four,
                    reachable post-login without hunting outside the tab
                    strip. Signed-out visitors still get both links from
                    LoginPage/SignupForm. Ordered before Danger Zone so the
                    destructive action stays last in the tab strip. */}
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
