import React from "react";
import { Box, Grid, Heading, Stack, Text, Wrap } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import Badge from "../ui/Badge";
import Card from "../ui/Card";
import LoadingState from "../ui/LoadingState";
import FormAlert from "../ui/FormAlert";
import { useMyPoliciesQuery } from "../policies/queries/policyQueries";
import { useMyPermissionsQuery } from "../policies/queries/permissionQueries";
import { buildEffectivePermissionList, dedupeAgainstWildcards } from "../policies/logic/effectiveGrants";

interface StatusSectionProps {
    heading: string;
    isLoading: boolean;
    isError: boolean;
    loadingMessage: string;
    failedMessage: string;
    children: React.ReactNode;
}

/** One policies/permissions block below, each with its own independent
 * loading/error/content state. Unlike
 * UserDetailsDialog's AuthorizationSection, there's no "restricted" state
 * to handle here: every query this card fires is the self-service /me
 * variant (GET /authorization/users/me/policies,
 * .../me/permissions - auth-only, no extra permission), so isError here
 * only ever means a genuine failure, never a permission gap. */
const StatusSection: React.FC<StatusSectionProps> = ({ heading, isLoading, isError, loadingMessage, failedMessage, children }) => (
    <Stack gap={2}>
        <Heading as="h2" size="lg" textStyle="sectionHeader">
            {heading}
        </Heading>
        {isLoading ? (
            <LoadingState message={loadingMessage} />
        ) : isError ? (
            <FormAlert size="lg" status="error">{failedMessage}</FormAlert>
        ) : (
            children
        )}
    </Stack>
);

/**
 * AccountStatusCard
 * ----------------------------
 * Read-only view of the caller's own full authorization picture - assigned
 * policies, effective permissions (the fanned-out union of every policy's
 * actions AND direct grants, same buildEffectivePermissionList
 * UserDetailsDialog's admin-facing "View" panel uses), and direct
 * (bypasses-Policy) grants specifically. Password status/change lives on
 * its own Password tab (ChangePasswordCard) instead - it isn't part of
 * authorization and doesn't belong next to it. All three sections here come
 * from the self-service endpoints (GET /authorization/users/me/policies,
 * .../me/permissions - auth-only, no policies:read/permissions:read
 * needed), since this is every authenticated user's own account settings
 * page, reachable regardless of whether they hold users:list_all - unlike
 * UserDetailsDialog on the Users page, which most callers can never open at
 * all. This is the one place in the app that shows granular
 * effective/direct permissions to a user who isn't also an admin who can
 * browse the Policies/Permissions pages.
 *
 * Both permission lists are run through dedupeAgainstWildcards before
 * rendering: a direct grant (or effective union entry) of some action on a
 * specific resource_type is already covered by that same action on "*" -
 * showing both as separate badges reads as duplication, not as two
 * distinct grants.
 *
 * All sections share one card (dividers between them, not separate cards):
 * splitting them cost a whole extra card's worth of padding/heading
 * overhead for no real separation of concerns.
 *
 * Laid out as a 2-column grid on md+ (My policies and Direct permissions -
 * the two things actually assigned to me - stacked on the left; the
 * computed Effective permissions union alone on the right, divided by a
 * vertical rule), not one column of three stacked sections: badge-heavy
 * permission lists routinely run to a dozen-plus entries, and full-width
 * sections stacked vertically pushed this tab well past a normal laptop
 * viewport, forcing it to scroll even though there was plenty of unused
 * horizontal room. Single column below `md`, where two side-by-side columns
 * would each be too narrow for a badge to read comfortably.
 *
 * The columns are NOT split evenly (unlike this card's own older layout):
 * `fit-content(320px) 1fr`, the same ratio UserDetailsDialog uses for its
 * fixed-facts-vs-open-ended-badges split. My policies/Direct permissions on
 * the left are typically a handful of entries - fixed to whatever they
 * actually need, up to 320px - while Effective permissions on the right (the
 * fanned-out union of both, see buildEffectivePermissionList) is usually the
 * longest list on this page and gets whatever width is left over, which
 * matters more now that this tab is no longer capped at maxW="5xl" (see
 * AccountSettingsPage.tsx) and can run the full page width.
 */
const AccountStatusCard: React.FC = () => {
    const { t } = useTranslation("account_settings");
    const { data: myPolicies, isLoading: policiesLoading, isError: policiesError } = useMyPoliciesQuery();
    const { data: myPermissions, isLoading: permissionsLoading, isError: permissionsError } = useMyPermissionsQuery();

    const policies = myPolicies?.policies ?? [];
    const rawDirectPermissions = myPermissions?.permissions ?? [];
    // Only accurate once both queries have actually resolved - a partial
    // (policies-only or permissions-only) union would understate what the
    // caller can really do, same reasoning as UserDetailsDialog's matching
    // canReadEffectivePermissions guard.
    const bothLoaded = !policiesLoading && !policiesError && !permissionsLoading && !permissionsError;
    const effectivePermissions = bothLoaded
        ? dedupeAgainstWildcards(buildEffectivePermissionList(policies, rawDirectPermissions))
        : [];
    // Dedupe the raw direct grants against the FULL effective set (fanned-out
    // policies + direct grants), not just against each other - a policy's
    // own wildcard (e.g. "system_superuser" on resource_type "*") already
    // covers a direct grant on a specific resource_type just as much as
    // another direct wildcard grant would. Falls back to deduping against
    // itself only while policies haven't loaded yet.
    const directPermissions = dedupeAgainstWildcards(
        rawDirectPermissions,
        bothLoaded ? buildEffectivePermissionList(policies, rawDirectPermissions) : rawDirectPermissions
    );

    return (
        <Card p={5}>
            {/* alignItems="start": Grid's own default (stretch) would force
                both columns to the height of whichever is taller - almost
                always the right column, whose permission badge lists
                routinely outgrow the left column's policy list - leaving
                the shorter column with a large trailing gap of pure
                whitespace instead of ending where its own content ends.
                Same reasoning as UserDetailsDialog's matching Grid. */}
            <Grid templateColumns={{ base: "1fr", md: "fit-content(320px) 1fr" }} gap={0} alignItems="start">
                <Stack gap={4} minW={0} pe={{ base: 0, md: 6 }} pb={{ base: 4, md: 0 }}>
                    <StatusSection
                        heading={t("accountStatus.myPolicies")}
                        isLoading={policiesLoading}
                        isError={policiesError}
                        loadingMessage={t("accountStatus.loadingPolicies")}
                        failedMessage={t("accountStatus.failedLoadPolicies")}
                    >
                        {policies.length > 0 ? (
                            <Wrap gap={2}>
                                {policies.map((p) => (
                                    <Badge key={p.name} colorPalette="brand" variant="subtle" size="md" fontSize="md">
                                        {p.name}
                                    </Badge>
                                ))}
                            </Wrap>
                        ) : (
                            <Text color="fg.muted">{t("accountStatus.noPolicies")}</Text>
                        )}
                    </StatusSection>

                    <Box borderTopWidth="1px" borderColor="border.default" />

                    {/* The raw direct grants only - not fanned out through
                        any policy - so it's clear which of the permissions
                        in "Effective permissions" (right column) came from a
                        one-off direct grant specifically, as opposed to
                        riding in on an assigned policy above. Directly below
                        My policies (not in the right column): both are "what
                        was assigned to me" (policies and direct grants are
                        the two independent assignment mechanisms), while
                        Effective permissions on the right is the *computed*
                        union of both - a different kind of thing. */}
                    <StatusSection
                        heading={t("accountStatus.directPermissions")}
                        isLoading={permissionsLoading}
                        isError={permissionsError}
                        loadingMessage={t("accountStatus.loadingDirectPermissions")}
                        failedMessage={t("accountStatus.failedLoadDirectPermissions")}
                    >
                        {directPermissions.length > 0 ? (
                            <Wrap gap={2}>
                                {directPermissions.map((g) => (
                                    <Badge key={`${g.action}:${g.resource_type}`} colorPalette="purple" variant="subtle" size="md" fontSize="md">
                                        {g.action} <Text as="span" color="fg.muted">({g.resource_type})</Text>
                                    </Badge>
                                ))}
                            </Wrap>
                        ) : (
                            <Text color="fg.muted">{t("accountStatus.noDirectPermissions")}</Text>
                        )}
                    </StatusSection>
                </Stack>

                <Stack
                    gap={4}
                    minW={0}
                    ps={{ base: 0, md: 6 }}
                    pt={{ base: 4, md: 0 }}
                    borderTopWidth={{ base: "1px", md: 0 }}
                    borderStartWidth={{ base: 0, md: "1px" }}
                    borderColor="border.default"
                >
                    {/* Union of every action the caller holds either way -
                        fanned-out assigned policies AND direct grants - not
                        just the raw direct grants in the left column, so
                        this reads as "everything I can actually do", not
                        "everything granted to me one-off". Same shape as
                        UserDetailsDialog's admin-facing equivalent. */}
                    <StatusSection
                        heading={t("accountStatus.effectivePermissions")}
                        isLoading={policiesLoading || permissionsLoading}
                        isError={policiesError || permissionsError}
                        loadingMessage={t("accountStatus.loadingEffectivePermissions")}
                        failedMessage={t("accountStatus.failedLoadEffectivePermissions")}
                    >
                        {effectivePermissions.length > 0 ? (
                            <Wrap gap={2}>
                                {effectivePermissions.map((g) => (
                                    <Badge key={`${g.action}:${g.resource_type}`} colorPalette="teal" variant="subtle" size="md" fontSize="md">
                                        {g.action} <Text as="span" color="fg.muted">({g.resource_type})</Text>
                                    </Badge>
                                ))}
                            </Wrap>
                        ) : (
                            <Text color="fg.muted">{t("accountStatus.noPermissions")}</Text>
                        )}
                    </StatusSection>
                </Stack>
            </Grid>
        </Card>
    );
};

export default AccountStatusCard;
