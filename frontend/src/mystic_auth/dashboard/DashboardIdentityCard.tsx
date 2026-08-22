import React from "react";
import { Box, Heading, Text, Separator, EmptyState, HStack, Stack, Flex, IconButton, Tooltip } from "@chakra-ui/react";
import { CalendarDays, Clock, LogOut, Mail, Monitor, Pencil, ShieldCheck, User, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatMemberSince, formatTimeOnly } from "../ui/dateFormat";
import { FAST_HOVER_TRANSITION } from "../theme/system";
import Badge from "../ui/Badge";
import DashboardIdentityCardSkeleton from "./DashboardIdentityCardSkeleton";
import DashboardStatItem from "./DashboardStatItem";
import FormAlert from "../ui/FormAlert";
import TableActionButton from "../ui/table_actions/TableActionButton";
import type { SupportedLanguage } from "../translations/translations";
import type { CurrentUserProfile } from "../auth/current_user/current_user_types";

interface DashboardIdentityCardProps {
    user: CurrentUserProfile | undefined;
    isLoading: boolean;
    isError: boolean;
    lastLoginAt: string | undefined;
    language: SupportedLanguage;
    logoutAllPending: boolean;
    logoutAllErrorMessage: string | undefined;
    onOpenProfileDialog: () => void;
    onNavigateToAccountSettings: () => void;
    onRequestLogoutAll: () => void;
}

/**
 * DashboardIdentityCard
 * ----------------------------
 * The identity + stats + quick-actions banner at the top of DashboardPage,
 * split out purely to keep DashboardPage.tsx under this project's
 * line-count budget - every layout decision/comment below moved verbatim,
 * none of the behavior changed. See DashboardPage.tsx for how `user`/
 * `lastLoginAt` are sourced (the shared useCurrentUserQuery/useLastLoginQuery
 * caches) and how the logout-all/profile-dialog state this card's callbacks
 * drive is owned by the parent.
 */
const DashboardIdentityCard: React.FC<DashboardIdentityCardProps> = ({
    user,
    isLoading,
    isError,
    lastLoginAt,
    language,
    logoutAllPending,
    logoutAllErrorMessage,
    onOpenProfileDialog,
    onNavigateToAccountSettings,
    onRequestLogoutAll,
}) => {
    const { t } = useTranslation("dashboard");

    if (isLoading) return <DashboardIdentityCardSkeleton loadingLabel={t("loadingDetails")} />;
    if (isError) return <Box><FormAlert status="error">{t("unableToFetch")}</FormAlert></Box>;
    if (!user) {
        return (
            <EmptyState.Root size="md">
                <EmptyState.Content>
                    <EmptyState.Indicator
                        bg="accent.subtle"
                        color="accent.fg"
                        borderWidth="1px"
                        borderColor="accent.border"
                        rounded="full"
                        boxSize="16"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                    >
                        <UserX size={32} aria-hidden="true" />
                    </EmptyState.Indicator>
                    <EmptyState.Title>{t("noUserData")}</EmptyState.Title>
                </EmptyState.Content>
            </EmptyState.Root>
        );
    }

    return (
        <Stack gap={3}>
            {/* Identity, stats, and the button column are three direct
                siblings of this Flex (not identity+stats grouped behind
                a shared flex="1 1 0%" wrapper) so justify="space-between"
                spreads any free space into the two gaps between them
                evenly - identity/stats/buttons end up evenly distanced
                from each other and from both ends of the card the same
                way at every width, instead of the wrapper absorbing all
                the free space into itself and leaving the gap bunched
                right before the button column. align="flex-start": name,
                every stat's label, and the first button all start at the
                exact same top line, regardless of which block ends up
                taller below that line (Last login's value runs two
                lines; the others don't). */}
            {/* align="stretch" on the row so the bare <Separator>s
                (no alignSelf override) stretch to match whichever
                block is tallest - Last login's two-line value
                usually makes that the stats block - instead of a
                guessed fixed height that risks looking too short
                next to it. Each actual content block overrides
                back to alignSelf="flex-start" so name, every
                stat's label, and the first button still all
                start at the exact same top line regardless. */}
            {/* direction switches at a fixed breakpoint instead of
                wrap="wrap" letting the row fold the moment its own
                content outgrows whatever width happens to be
                available: content-driven wrap sits right at that
                knife's-edge width, so the ~15-17px a classic
                (non-overlay) scrollbar's disappearance/reappearance
                takes from the viewport - e.g. opening ConfirmDialog
                below, whose scroll-lock removes the page scrollbar -
                was enough by itself to fold "Account Settings"/
                "Logout All" onto their own line and back on every
                open/close. A breakpoint has tens to hundreds of
                px of margin on either side, so the same shift
                never lands on the boundary.

                At "xl"+ this row no longer wraps at all: only the
                identity block (flex="0 1 auto" below) is allowed to
                shrink, so stats and the action buttons keep their
                natural width and can never themselves be pushed
                onto a second line - a long name/email/role now
                truncates further inside the identity block
                instead of (as a first attempt at this got wrong)
                still blowing out the row's total width and
                folding the whole button column below it. Threshold
                bumped from "lg" to "xl" once Last login became a
                third stat column: with three fixed-width stats
                (was two) plus the two action buttons all
                non-shrinking, "lg" (1024px) no longer left the
                identity block enough room even at its own floor
                (avatar + name/role's own minW's below), which
                doesn't shrink away - it has to go SOMEWHERE, and
                with no ancestor minW guarding it (see below) it
                was overflowing past its own column and
                overlapping the stats next to it, worst at a
                larger root font-size (Settings > Size) where
                every rem-based width here grows in lockstep. */}
            <Flex align="stretch" justify="space-between" gap={6} direction={{ base: "column", xl: "row" }} wrap={{ base: "wrap", xl: "nowrap" }} rowGap={4}>
                {/* Only the identity block scrolls internally
                    (overflowX="auto") if its own floor still doesn't
                    fit at "xl"+ (a genuinely long name/email at "large"
                    text on a narrower "xl" viewport) - same fallback
                    DataTable's own columns use (see usersColumns.tsx's
                    matching comment) - while stats and
                    "Account Settings"/"Logout All" stay fully visible
                    outside it. flex="0 1 auto" (shrink but never grow)
                    keeps this block from eating the row's free space the
                    way the old flex="1 1 0%" wrapper did. */}
                <HStack gap={4} alignSelf="flex-start" flex="0 1 auto" minW={0} overflowX="auto">
                    {/* The avatar itself is the View trigger (opens
                        ProfileDetailsDialog) instead of a separate Eye
                        button down in the email row - one obvious click
                        target instead of two, and it stays put right at
                        the start of the identity block regardless of how
                        short the name/email happen to be. */}
                    <Tooltip.Root openDelay={300} closeDelay={100}>
                        <Tooltip.Trigger asChild>
                            <IconButton
                                aria-label={t("identityDetailsDialog.viewButton")}
                                onClick={onOpenProfileDialog}
                                variant="plain"
                                boxSize="14"
                                flexShrink={0}
                                borderRadius="full"
                                borderWidth="1px"
                                borderColor="brand.border"
                                bg="brand.subtle"
                                color="brand.fg"
                                transition={FAST_HOVER_TRANSITION}
                                _hover={{ bg: "brand.selected" }}
                            >
                                <User size={28} aria-hidden="true" />
                            </IconButton>
                        </Tooltip.Trigger>
                        <Tooltip.Positioner>
                            <Tooltip.Content>{t("identityDetailsDialog.viewButton")}</Tooltip.Content>
                        </Tooltip.Positioner>
                    </Tooltip.Root>

                    <Box minW={0} flex="1 1 auto">
                        {/* Ellipsis on both the name and the role badge (same
                            convention as the truncated DataTable columns), not just
                            the email below - a long enough name or a long custom
                            role label grows this block just as unboundedly as the
                            email does. maxW="100%" truncates to whatever width this
                            Box is actually given (bounded above by the Badge's own
                            10rem cap) rather than a guessed fixed rem value, so it
                            keeps working whether it's next to two stats or three. */}
                        <HStack gap={2} minW={0}>
                            {/* flex-grow left at 0: the name should hug its own
                                width and sit right next to the role badge, not
                                stretch to fill the row and shove the badge off to
                                the far edge. minW="5rem" is still a shrink floor,
                                not a target: the name is the single most important
                                thing in this row, so once space runs short the role
                                badge below (flexShrink allowed, no minW floor of
                                its own beyond its own small one) gives way first -
                                the name only shrinks past 5rem if there's truly no
                                room left for either. */}
                            <Heading as="h1" fontSize="xl" fontWeight="semibold" flex="0 1 auto" minW="8rem" maxW="100%" truncate title={user.name}>
                                {user.name}
                            </Heading>
                            <Badge
                                colorPalette={user.role ? "brand" : "gray"}
                                variant="subtle"
                                px={2.5}
                                py={1}
                                fontSize="md"
                                borderRadius="full"
                                textTransform="capitalize"
                                display="inline-flex"
                                alignItems="center"
                                gap={1}
                                flexShrink={1}
                                maxW="9rem"
                                minW="3rem"
                                overflow="hidden"
                                title={user.role ?? t("noRole")}
                            >
                                <ShieldCheck size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                                <Text as="span" truncate>{user.role ?? t("noRole")}</Text>
                            </Badge>
                        </HStack>
                        {/* Same ellipsis treatment for the email - letting it grow
                            without bound was the original report here. flex-grow
                            left at 0 (not "1 1 auto"): the email should hug its own
                            width same as the name above it, not stretch to fill the
                            row. Clicking the avatar to the left (not a button here
                            anymore) opens ProfileDetailsDialog, showing the
                            untruncated name/email/role together. */}
                        <HStack gap={2} color="fg.muted" mt={1} minW={0}>
                            <Mail size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
                            <Text fontSize="md" flex="0 1 auto" maxW="100%" truncate title={user.email}>
                                {user.email}
                            </Text>
                        </HStack>
                    </Box>
                </HStack>

                <Separator orientation="vertical" display={{ base: "none", xl: "block" }} flexShrink={0} />

                {/* wrap switches at the same "xl" breakpoint the outer
                    Flex above uses, instead of content-driven wrap="wrap":
                    on wide viewports this row sits comfortably within its
                    available width, so a purely content-driven wrap left it
                    sitting right at the knife's-edge where the ~15-17px a
                    classic scrollbar's disappearance/reappearance takes
                    from the viewport - e.g. opening ConfirmDialog, whose
                    scroll-lock removes the page scrollbar - was enough by
                    itself to fold "Active sessions" onto its own line and
                    back on every open/close. See the outer Flex's matching
                    comment above for the full explanation. */}
                <HStack gap={6} align="flex-start" alignSelf="flex-start" wrap={{ base: "wrap", xl: "nowrap" }} rowGap={4} flexShrink={0}>
                    <DashboardStatItem
                        icon={<CalendarDays size={15} aria-hidden="true" />}
                        label={t("memberSince")}
                        value={<Text fontSize="md" fontWeight="semibold">{formatMemberSince(user.created_at, language)}</Text>}
                    />
                    <DashboardStatItem
                        icon={<Clock size={15} aria-hidden="true" />}
                        label={t("lastLogin")}
                        value={
                            lastLoginAt ? (
                                // Date on one line, time on the next - the combined
                                // "Aug 1, 2026, 4:23 PM" string is the widest thing in
                                // this row by far, and this stat sits in a fixed-width
                                // column next to two much shorter ones, so splitting it
                                // keeps that column no wider than "Member since"/
                                // "Active sessions" instead of stretching the whole row.
                                <Box lineHeight="1.3">
                                    <Text fontSize="md" fontWeight="semibold">{formatMemberSince(lastLoginAt, language)}</Text>
                                    <Text fontSize="md" fontWeight="medium" color="fg.muted">{formatTimeOnly(lastLoginAt, language)}</Text>
                                </Box>
                            ) : (
                                <Text fontSize="md" fontWeight="semibold">-</Text>
                            )
                        }
                    />
                    <DashboardStatItem
                        icon={<Monitor size={15} aria-hidden="true" />}
                        label={user.active_sessions === 1 ? t("activeSession") : t("activeSessions")}
                        value={<Text fontSize="md" fontWeight="semibold">{user.active_sessions}</Text>}
                    />
                </HStack>

                <Separator orientation="vertical" display={{ base: "none", xl: "block" }} flexShrink={0} />

                <Stack gap={4} flexShrink={0} alignSelf="flex-start">
                    <TableActionButton
                        size="sm"
                        fontSize="md"
                        colorPalette="orange"
                        onClick={onNavigateToAccountSettings}
                    >
                        <Pencil size={16} aria-hidden="true" /> {t("accountSettingsButton")}
                    </TableActionButton>
                    <TableActionButton
                        size="sm"
                        fontSize="md"
                        colorPalette="red"
                        loading={logoutAllPending}
                        onClick={onRequestLogoutAll}
                    >
                        <LogOut size={16} aria-hidden="true" /> {t("logoutAllButton")}
                    </TableActionButton>
                </Stack>
            </Flex>

            {logoutAllErrorMessage && <FormAlert status="error">{logoutAllErrorMessage}</FormAlert>}
        </Stack>
    );
};

export default DashboardIdentityCard;
