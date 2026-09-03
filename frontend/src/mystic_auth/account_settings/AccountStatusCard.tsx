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
 * loading/error/content state. Unlike UserDetailsDialog's
 * AuthorizationSection, there's no "restricted" state here: every query
 * this card fires is the self-service /me variant (auth-only, no extra
 * permission needed), so isError only ever means a genuine failure, never
 * a permission gap. */
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
 * Read-only view of the caller's own full authorization picture: assigned
 * policies, effective permissions (the fanned-out union of every policy's
 * actions and direct grants, via the same buildEffectivePermissionList
 * UserDetailsDialog's admin "View" panel uses), and direct grants
 * specifically. Password status/change lives on its own Password tab
 * instead, since it isn't part of authorization. All three sections come
 * from the self-service /me endpoints (auth-only, no extra permission
 * needed), so this works for any authenticated user, not just admins who
 * can open UserDetailsDialog on the Users page.
 *
 * Both permission lists run through dedupeAgainstWildcards before
 * rendering: a grant of some action on a specific resource_type is already
 * covered by that same action on "*", so showing both as separate badges
 * would read as duplication.
 *
 * All sections share one card with dividers rather than separate cards, to
 * avoid extra padding/heading overhead for no real separation of concerns.
 *
 * Laid out as a 2-column grid on md+ (My policies and Direct permissions,
 * the things actually assigned to me, on the left; the computed Effective
 * permissions union on the right) rather than one stacked column: badge-heavy
 * permission lists often run a dozen-plus entries, and stacking them
 * vertically pushed this tab past a normal laptop viewport. Single column
 * below `md`, where two columns would each be too narrow for a badge to read
 * comfortably.
 *
 * Columns are split `fit-content(320px) 1fr`, not evenly: My policies/Direct
 * permissions are typically a handful of entries capped at 320px, while
 * Effective permissions on the right is usually the longest list and gets
 * the rest of the width, which matters more now that this tab runs the full
 * page width (see AccountSettingsPage.tsx).
 */
const AccountStatusCard: React.FC = () => {
    const { t } = useTranslation("account_settings");
    const { data: myPolicies, isLoading: policiesLoading, isError: policiesError } = useMyPoliciesQuery();
    const { data: myPermissions, isLoading: permissionsLoading, isError: permissionsError } = useMyPermissionsQuery();

    const policies = myPolicies?.policies ?? [];
    const rawDirectPermissions = myPermissions?.permissions ?? [];
    // Only accurate once both queries resolve: a partial union would
    // understate what the caller can really do (same guard as
    // UserDetailsDialog's canReadEffectivePermissions).
    const bothLoaded = !policiesLoading && !policiesError && !permissionsLoading && !permissionsError;
    const effectivePermissions = bothLoaded
        ? dedupeAgainstWildcards(buildEffectivePermissionList(policies, rawDirectPermissions))
        : [];
    // Dedupe raw direct grants against the full effective set (policies +
    // direct grants), not just against each other: a policy's own wildcard
    // (e.g. "system_superuser" on resource_type "*") already covers a direct
    // grant on a specific resource_type. Falls back to deduping against
    // itself while policies haven't loaded yet.
    const directPermissions = dedupeAgainstWildcards(
        rawDirectPermissions,
        bothLoaded ? buildEffectivePermissionList(policies, rawDirectPermissions) : rawDirectPermissions
    );

    return (
        <Card p={5}>
            {/* alignItems="start": Grid's default (stretch) would force both
                columns to the height of the taller one, usually the right column,
                leaving the shorter column with a trailing gap of whitespace
                instead of ending where its content ends. Same as
                UserDetailsDialog's Grid. */}
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

                    {/* Raw direct grants only, not fanned out through any policy,
                        so it's clear which entries in Effective permissions came
                        from a one-off grant versus an assigned policy. Placed under
                        My policies since both are "what was assigned to me", while
                        Effective permissions on the right is the computed union of
                        both. */}
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
                    {/* Union of every action the caller holds either way (policies
                        and direct grants), not just the raw direct grants in the
                        left column, so this reads as "everything I can actually do".
                        Same shape as UserDetailsDialog's admin-facing equivalent. */}
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
