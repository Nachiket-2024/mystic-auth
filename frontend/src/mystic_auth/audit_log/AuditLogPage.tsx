import React from "react";
import { Tabs } from "@chakra-ui/react";
import { ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import PageContainer from "../ui/PageContainer";
import { IfCan } from "../authorization/IfCan";
import { PERMISSIONS } from "../authorization/permissions";
import MyAuthorizationLogSection from "./authorization_log/MyAuthorizationLogSection";
import AllAuthorizationLogSection from "./authorization_log/AllAuthorizationLogSection";
import MySecurityLogSection from "./security_log/MySecurityLogSection";
import AllSecurityLogSection from "./security_log/AllSecurityLogSection";

/**
 * AuditLogPage
 * ----------------------------
 * Every authenticated user can see their own authorization-decision and security-event
 * history (backend: GET /authorization/audit-log/me, GET /audit/security-log/me, auth-only).
 * A caller who also holds policies:read / security_audit:read gets an "All users" tab for
 * that log, backed by the matching management endpoint. The route itself needs no permission:
 * each tab decides its own access via IfCan, mirroring how the backend splits self vs.
 * management visibility across these four endpoints.
 *
 * Category (Authorization decisions vs. Security events) and scope (My activity vs. All
 * users) are two independent tab bars rather than both log types stacked on one page: only
 * one table renders at a time. Every table pages via numbered Pagination, sorts server-side
 * by column header, and narrows further via a filter bar; all page/filter state lives
 * client-side while the data stays server-side, so none of this depends on log size.
 *
 * Split by section into two subfolders matching the two tabs: authorization_log/
 * (MyAuthorizationLogSection, AllAuthorizationLogSection, AuthorizationFilterBar, and its own
 * columns/queries/resourceTypes files) and security_log/ (the same set, plus
 * LoginTrendChart.tsx). What's identical across both tabs lives here instead:
 * auditLogListConfig.ts (PAGE_SIZE/formatTimestamp/etc.) and auditLogPageResult.ts
 * (X-Total-Count -> {rows,total} parsing). This file is just the tab shell.
 */
interface AuditLogPageProps {
    /**
     * Resource types/actions beyond this app's own PBAC vocabulary (authorizationLogResourceTypes.ts /
     * permissions.ts), for downstream projects that extend PBAC for their own domain. Same
     * pattern as AppLayout's extraNavItems: additive, optional, no-op when omitted.
     * See docs/mystic_auth/template-usage/frontend-customization.md#shared-chrome-extension-points.
     */
    extraResourceTypes?: string[];
    extraActions?: string[];
}

const AuditLogPage: React.FC<AuditLogPageProps> = ({ extraResourceTypes, extraActions }) => {
    const { t } = useTranslation("audit_log");

    // Read-once initializers (see AccountSettingsPage's matching comment for the `key`
    // reasoning): CommandPalette's content-search results (layout/command_palette/searchItems.ts)
    // navigate to e.g. /audit-log?category=security&scope=all to land on a specific
    // category+scope pair. `scope` means the same thing in both category branches (each has
    // its own inner Tabs.Root), so it's read once here rather than per-branch.
    const [searchParams] = useSearchParams();
    const initialCategory = searchParams.get("category") ?? "authorization";
    const initialScope = searchParams.get("scope") ?? "mine";

    return (
        <PageContainer title={t("page.title")} icon={ScrollText} description={t("page.description")}>
            <Tabs.Root key={initialCategory} defaultValue={initialCategory} mb={4} lazyMount unmountOnExit>
                <Tabs.List>
                    <Tabs.Trigger value="authorization" fontSize="md">{t("tabs.authorizationDecisions")}</Tabs.Trigger>
                    <Tabs.Trigger value="security" fontSize="md">{t("tabs.securityEvents")}</Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="authorization">
                    <Tabs.Root key={initialScope} defaultValue={initialScope} lazyMount unmountOnExit>
                        <Tabs.List>
                            <Tabs.Trigger value="mine" fontSize="md">{t("tabs.myActivity")}</Tabs.Trigger>
                            <IfCan action={PERMISSIONS.POLICIES_READ}>
                                <Tabs.Trigger value="all" fontSize="md">{t("tabs.allUsers")}</Tabs.Trigger>
                            </IfCan>
                        </Tabs.List>
                        <Tabs.Content value="mine">
                            <MyAuthorizationLogSection
                                extraResourceTypes={extraResourceTypes}
                                extraActions={extraActions}
                            />
                        </Tabs.Content>
                        <IfCan action={PERMISSIONS.POLICIES_READ}>
                            <Tabs.Content value="all">
                                <AllAuthorizationLogSection
                                    extraResourceTypes={extraResourceTypes}
                                    extraActions={extraActions}
                                />
                            </Tabs.Content>
                        </IfCan>
                    </Tabs.Root>
                </Tabs.Content>

                <Tabs.Content value="security">
                    <Tabs.Root key={initialScope} defaultValue={initialScope} lazyMount unmountOnExit>
                        <Tabs.List>
                            <Tabs.Trigger value="mine" fontSize="md">{t("tabs.myActivity")}</Tabs.Trigger>
                            <IfCan action={PERMISSIONS.SECURITY_AUDIT_READ}>
                                <Tabs.Trigger value="all" fontSize="md">{t("tabs.allUsers")}</Tabs.Trigger>
                            </IfCan>
                        </Tabs.List>
                        <Tabs.Content value="mine">
                            <MySecurityLogSection />
                        </Tabs.Content>
                        <IfCan action={PERMISSIONS.SECURITY_AUDIT_READ}>
                            <Tabs.Content value="all">
                                <AllSecurityLogSection />
                            </Tabs.Content>
                        </IfCan>
                    </Tabs.Root>
                </Tabs.Content>
            </Tabs.Root>
        </PageContainer>
    );
};

export default AuditLogPage;
