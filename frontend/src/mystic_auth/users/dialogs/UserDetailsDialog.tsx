import React from "react";
import { Button, Dialog, Grid, Heading, HStack, Portal, Stack, Text, Wrap } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import Badge from "../../ui/Badge";
import LoadingState from "../../ui/LoadingState";
import FormAlert from "../../ui/FormAlert";
import { isForbiddenError } from "../../api/apiError";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../../ui/styles/dialogStyles";
import { CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../../ui/styles/buttonStyles";
import { formatDateTime } from "../../ui/dateFormat";
import { useLanguageStore } from "../../store/languageStore";
import { useAuthStore } from "../../store/authStore";
import { useCan } from "../../authorization/useCan";
import { PERMISSIONS } from "../../authorization/permissions";
import { useUserPoliciesQuery, useMyPoliciesQuery } from "../../policies/queries/policyQueries";
import { useUserPermissionsQuery, useMyPermissionsQuery } from "../../policies/queries/permissionQueries";
import { buildEffectivePermissionList, dedupeAgainstWildcards } from "../../policies/logic/effectiveGrants";
import type { ManagedUserRead } from "../../api/users_api";

interface UserDetailsDialogProps {
    isOpen: boolean;
    user: ManagedUserRead | null;
    onClose: () => void;
}

interface DetailRowProps {
    label: string;
    children: React.ReactNode;
}

/** Label/value pair, wrapping (not truncating) the value: the entire point
 * of this dialog is showing what the table's own truncated columns cut
 * off, so nothing in it should re-truncate the same content. */
const DetailRow: React.FC<DetailRowProps> = ({ label, children }) => (
    <Stack gap={0.5}>
        <Text fontSize="sm" fontWeight="semibold" textTransform="uppercase" letterSpacing="wide" color="fg.muted">
            {label}
        </Text>
        {/* as="div", not Text's default <p>: the Status row's value is an
            HStack of badges (renders a <div>), and a <div> can't legally
            nest inside a <p> - this wrapper has to stay block-agnostic
            since every row shares it regardless of what kind of content
            it holds. */}
        <Text as="div" fontSize="md" wordBreak="break-word">
            {children}
        </Text>
    </Stack>
);

interface AuthorizationSectionProps {
    heading: string;
    restricted?: string;
    loading?: string;
    error?: string;
    emptyText?: string;
    badges?: string[];
    // Matches AccountStatusCard's own self-service equivalent: policies,
    // direct permissions, and effective permissions each get their own
    // color (brand/purple/teal) so the three sections stay visually
    // distinct at a glance rather than blurring into one same-colored wall
    // of chips - not just here, but consistently with what a caller sees
    // of their own access on the Account Settings page.
    colorPalette: "brand" | "purple" | "teal";
}

/** One labeled block within the Policies/Permissions area: exactly one of
 * restricted/loading/error/emptyText/badges is meaningful at a time, chosen
 * by whichever the caller passes - each of Policies, Effective permissions,
 * and Direct permissions independently tracks its own gating/loading/error
 * state (see UserDetailsDialog's own docstring), so this can't just be one
 * shared isLoading/isError pair. */
const AuthorizationSection: React.FC<AuthorizationSectionProps> = ({ heading, restricted, loading, error, emptyText, badges, colorPalette }) => (
    <Stack gap={2}>
        {/* Same heading treatment as AccountStatusCard's own StatusSection
            (the self-service equivalent of this exact block), not the
            small uppercase label style DetailRow uses above - those are
            fixed one-line facts, these are open-ended badge lists that read
            better under a real section heading. */}
        <Heading as="h2" size="lg" textStyle="sectionHeader">
            {heading}
        </Heading>
        {restricted !== undefined ? (
            <Text color="fg.muted">{restricted}</Text>
        ) : loading !== undefined ? (
            <LoadingState message={loading} />
        ) : error !== undefined ? (
            <FormAlert size="lg" status="error">{error}</FormAlert>
        ) : !badges || badges.length === 0 ? (
            <Text color="fg.muted">{emptyText}</Text>
        ) : (
            <Wrap gap={2}>
                {badges.map((label) => (
                    <Badge key={label} colorPalette={colorPalette} variant="subtle" size="md" fontSize="md">
                        {label}
                    </Badge>
                ))}
            </Wrap>
        )}
    </Stack>
);

/**
 * UserDetailsDialog
 * ----------------------------
 * Read-only "View" panel for one user's full name/email/role/status/dates -
 * everything UsersPage's own Name/Email columns truncate (see DataTable.tsx's
 * `truncate` columns) for table layout reasons. Purely a display surface, no
 * mutations of its own: role changes, policy assignment, delete/reactivate/
 * purge all stay on their own existing controls. Takes the already-fetched
 * row object directly (no separate query), since UsersPage already has the
 * full, untruncated data in hand the moment a row renders.
 */
const UserDetailsDialog: React.FC<UserDetailsDialogProps> = ({ isOpen, user, onClose }) => {
    const { t } = useTranslation(["users", "ui_text"]);
    // See AllAuthorizationLogSection.tsx's matching comment: dates use
    // chromeLanguage, not pageLanguage.
    const language = useLanguageStore((s) => s.chromeLanguage);

    const currentUserEmail = useAuthStore((s) => s.email);
    const userEmail = user?.email ?? "";
    const isSelf = !!userEmail && userEmail === currentUserEmail;

    const hasPoliciesReadPermission = useCan(PERMISSIONS.POLICIES_READ);
    const hasPermissionsReadPermission = useCan(PERMISSIONS.PERMISSIONS_READ);
    const canViewPolicies = isSelf || hasPoliciesReadPermission;
    const canViewPermissions = isSelf || hasPermissionsReadPermission;
    const canViewEffective = canViewPolicies && canViewPermissions;

    // Own row = self-service /me endpoints, not the management ones (see
    // UserPoliciesDialog/UserPermissionsDialog's matching switch) - a
    // caller always has access to their own /me endpoints regardless of
    // holding policies:read/permissions:read.
    const managementPoliciesQuery = useUserPoliciesQuery(userEmail, isOpen && !!userEmail && !isSelf && hasPoliciesReadPermission);
    const myPoliciesQuery = useMyPoliciesQuery(isOpen && isSelf);
    const policiesQuery = isSelf ? myPoliciesQuery : managementPoliciesQuery;

    const managementPermissionsQuery = useUserPermissionsQuery(userEmail, isOpen && !!userEmail && !isSelf && hasPermissionsReadPermission);
    const myPermissionsQuery = useMyPermissionsQuery(isOpen && isSelf);
    const permissionsQuery = isSelf ? myPermissionsQuery : managementPermissionsQuery;

    if (!user) return null;

    const assignedPolicies = policiesQuery.data?.policies ?? [];
    const directGrants = permissionsQuery.data?.permissions ?? [];

    const effectiveList =
        canViewEffective && policiesQuery.data && permissionsQuery.data
            ? dedupeAgainstWildcards(buildEffectivePermissionList(assignedPolicies, directGrants))
            : [];

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={(details) => !details.open && onClose()}
            closeOnInteractOutside
            // Wide enough for the two-column layout below (name/email/role
            // on the left, Policies/Effective/Direct permissions on the
            // right) to actually read as two columns rather than a cramped
            // wrap - the dialog's own default width was sized for the old
            // single-column stack.
            size="xl"
        >
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                        {/* maxW override on top of size="xl" (the largest fixed size
                            used anywhere else in this app - see PolicyDetailsDialog):
                            the right column is an open-ended list of badges that only
                            grows as more permissions get added to the catalog over time,
                            so this dialog gets some headroom beyond every other dialog's
                            own max rather than sharing their cap. */}
                    <Dialog.Content {...DIALOG_CONTENT_PROPS} maxW={{ md: "3xl", lg: "4xl" }}>
                        <Dialog.Header>
                            <Dialog.Title>{t("users:detailsDialog.title")}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            {/* The left column (fixed one-line facts - name/email/role/
                                status/dates) is normally the shorter of the two, so it sizes
                                to its own content rather than always claiming an equal half
                                of this now-wider dialog - a short name/email shouldn't leave
                                a wide empty gutter before Policies starts. fit-content(320px)
                                (not minmax(min-content, 320px): a minmax track's max is a
                                definite size grid sizing fills greedily, so that sized to
                                320px flat regardless of how short the content actually was)
                                caps a long name/email at 320px, past which it reads as "the
                                details column" rather than the dialog's main content - at
                                that point the right column (Policies/Effective/Direct
                                permissions - open-ended badge lists that actually benefit
                                from the dialog's extra width) takes whatever's left. A real
                                border between the columns (borderStartWidth, not just a gap)
                                reads as one divided panel rather than two coincidentally-
                                adjacent stacks - same reasoning as AccountStatusCard's own
                                divider (that file's own comment on its right column cross-
                                references this dialog, though its version splits evenly
                                since both its columns hold open-ended badge lists, not one
                                side of fixed facts). Single column below `md`: there's no
                                room for two on a narrow dialog, so the divider becomes a top
                                border instead of a side one. */}
                            <Grid templateColumns={{ base: "1fr", md: "fit-content(320px) 1fr" }} gap={0} alignItems="start">
                                <Stack gap={4} minW={0} pe={{ base: 0, md: 6 }} pb={{ base: 4, md: 0 }}>
                                    <DetailRow label={t("users:detailsDialog.name")}>{user.name}</DetailRow>
                                    <DetailRow label={t("users:detailsDialog.email")}>{user.email}</DetailRow>
                                    <DetailRow label={t("users:detailsDialog.role")}>
                                        <Text as="span" textTransform="capitalize" color={user.role ? undefined : "fg.muted"}>
                                            {user.role ?? t("users:detailsDialog.noRoleAssigned")}
                                        </Text>
                                    </DetailRow>
                                    <DetailRow label={t("users:detailsDialog.status")}>
                                        <HStack gap={2} wrap="wrap">
                                            <Badge colorPalette={user.is_verified ? "green" : "yellow"} size="md">
                                                {user.is_verified ? t("users:detailsDialog.verified") : t("users:detailsDialog.unverified")}
                                            </Badge>
                                            {user.deleted_at ? (
                                                <Badge colorPalette="red" size="md">{t("users:detailsDialog.deleted")}</Badge>
                                            ) : (
                                                !user.is_active && <Badge colorPalette="red" size="md">{t("users:detailsDialog.inactive")}</Badge>
                                            )}
                                            <Badge colorPalette={user.has_password ? "gray" : "blue"} size="md">
                                                {user.has_password ? t("users:detailsDialog.hasPassword") : t("users:detailsDialog.oauthOnly")}
                                            </Badge>
                                        </HStack>
                                    </DetailRow>
                                    <DetailRow label={t("users:detailsDialog.created")}>{formatDateTime(user.created_at, language)}</DetailRow>
                                    <DetailRow label={t("users:detailsDialog.lastUpdated")}>{formatDateTime(user.updated_at, language)}</DetailRow>
                                    {user.deleted_at && (
                                        <DetailRow label={t("users:detailsDialog.deletedAt")}>{formatDateTime(user.deleted_at, language)}</DetailRow>
                                    )}
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
                                <AuthorizationSection
                                    heading={t("users:detailsDialog.policies")}
                                    colorPalette="brand"
                                    restricted={!canViewPolicies ? t("users:detailsDialog.policiesRestricted") : undefined}
                                    loading={canViewPolicies && policiesQuery.isLoading ? t("users:detailsDialog.loadingPolicies") : undefined}
                                    error={
                                        canViewPolicies && policiesQuery.isError
                                            ? isForbiddenError(policiesQuery.error)
                                                ? t("users:detailsDialog.policiesRestricted")
                                                : t("users:detailsDialog.failedToLoadPolicies")
                                            : undefined
                                    }
                                    emptyText={t("users:detailsDialog.noPolicies")}
                                    badges={assignedPolicies.map((p) => p.name)}
                                />

                                <AuthorizationSection
                                    heading={t("users:detailsDialog.effectivePermissions")}
                                    colorPalette="teal"
                                    restricted={!canViewEffective ? t("users:detailsDialog.effectivePermissionsRestricted") : undefined}
                                    loading={
                                        canViewEffective && (policiesQuery.isLoading || permissionsQuery.isLoading)
                                            ? t("users:detailsDialog.loadingAuthorization")
                                            : undefined
                                    }
                                    error={
                                        canViewEffective && (policiesQuery.isError || permissionsQuery.isError)
                                            ? isForbiddenError(policiesQuery.error) || isForbiddenError(permissionsQuery.error)
                                                ? t("users:detailsDialog.effectivePermissionsRestricted")
                                                : t("users:detailsDialog.failedToLoadAuthorization")
                                            : undefined
                                    }
                                    emptyText={t("users:detailsDialog.noPermissions")}
                                    badges={effectiveList.map((g) => g.action)}
                                />

                                <AuthorizationSection
                                    heading={t("users:detailsDialog.directPermissions")}
                                    colorPalette="purple"
                                    restricted={!canViewPermissions ? t("users:detailsDialog.permissionsRestricted") : undefined}
                                    loading={canViewPermissions && permissionsQuery.isLoading ? t("users:detailsDialog.loadingPermissions") : undefined}
                                    error={
                                        canViewPermissions && permissionsQuery.isError
                                            ? isForbiddenError(permissionsQuery.error)
                                                ? t("users:detailsDialog.permissionsRestricted")
                                                : t("users:detailsDialog.failedToLoadPermissions")
                                            : undefined
                                    }
                                    emptyText={t("users:detailsDialog.noDirectPermissions")}
                                    badges={directGrants.map((g) => g.action)}
                                />
                                </Stack>
                            </Grid>
                        </Dialog.Body>
                        <Dialog.Footer>
                            <Button onClick={onClose} {...SECONDARY_BUTTON_PROPS}>
                                {t("ui_text:close")}
                            </Button>
                        </Dialog.Footer>
                        {/* Chakra v3's Dialog.CloseTrigger renders no icon of its own
                            (unlike v2) - without explicit children it was an empty
                            0x0 button, invisible to every user, not just screen
                            readers (axe-core button-name audit). */}
                        <Dialog.CloseTrigger aria-label={t("ui_text:closeDialog")} {...CLOSE_TRIGGER_PROPS}>
                            <X size={16} aria-hidden="true" />
                        </Dialog.CloseTrigger>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    );
};

export default UserDetailsDialog;
