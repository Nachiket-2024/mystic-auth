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
 * split out to keep DashboardPage.tsx under this project's line-count
 * budget (no behavior changed). See DashboardPage.tsx for how `user`/
 * `lastLoginAt` are sourced and how the logout-all/profile-dialog state
 * this card's callbacks drive is owned by the parent.
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
            {/* Identity, stats, and buttons are three direct siblings of
                this Flex (not identity+stats grouped under a shared
                wrapper) so justify="space-between" spreads free space
                evenly between them, instead of a wrapper soaking it up
                and bunching the gap right before the buttons.
                align="flex-start" keeps the name, every stat's label, and
                the first button on the same top line even though Last
                login's value runs two lines and the others don't. */}
            {/* align="stretch" on the row lets the bare <Separator>s
                stretch to match whichever block is tallest (usually the
                stats block, because of Last login's two-line value)
                instead of a guessed fixed height. Each content block then
                overrides back to alignSelf="flex-start" so everything
                still lines up on the same top line. */}
            {/* direction switches at a fixed breakpoint instead of using
                wrap="wrap", because content-driven wrap sits right at the
                width a classic scrollbar's disappearance/reappearance can
                tip over (e.g. opening ConfirmDialog below removes the page
                scrollbar), which was enough to fold "Account Settings"/
                "Logout All" onto their own line and back on every
                open/close. A fixed breakpoint has margin on both sides so
                that never happens.

                At "xl"+ the row stops wrapping entirely: only the identity
                block (flex="0 1 auto") is allowed to shrink, so stats and
                buttons keep their natural width and never get pushed to a
                second line; a long name/email/role truncates further
                inside the identity block instead. The breakpoint moved
                from "lg" to "xl" once Last login became a third stat
                column: three fixed-width stats plus two buttons no longer
                left the identity block room even at its own floor, so it
                overflowed and overlapped the stats next to it (worse at
                larger root font sizes, since every rem-based width here
                grows together). */}
            <Flex align="stretch" justify="space-between" gap={6} direction={{ base: "column", xl: "row" }} wrap={{ base: "wrap", xl: "nowrap" }} rowGap={4}>
                {/* Only the identity block scrolls internally
                    (overflowX="auto") if it still doesn't fit at "xl"+
                    (a long name/email at large text on a narrow "xl"
                    viewport), same fallback as DataTable's own columns.
                    Stats and the buttons stay fully visible outside it.
                    flex="0 1 auto" keeps this block from eating the row's
                    free space. overflowY="hidden" alongside overflowX="auto"
                    is required, not cosmetic: per the CSS overflow spec, one
                    axis set to a non-visible value makes the browser compute
                    the other axis as auto too, which otherwise shows a stray
                    vertical scrollbar even though nothing here overflows
                    vertically. */}
                <HStack gap={4} alignSelf="flex-start" flex="0 1 auto" minW={0} overflowX="auto" overflowY="hidden">
                    {/* The avatar itself is the View trigger (opens
                        ProfileDetailsDialog) instead of a separate Eye
                        button in the email row: one obvious click target,
                        and it stays put regardless of name/email length. */}
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
                        {/* Ellipsis on the name and role badge too, not just the
                            email below: a long name or custom role label can
                            grow this block just as unboundedly. maxW="100%"
                            truncates to whatever width this Box is actually
                            given, so it keeps working next to two stats or
                            three. */}
                        <HStack gap={2} minW={0}>
                            {/* flex-grow left at 0: the name hugs its own width
                                next to the role badge instead of stretching to
                                fill the row. minW="5rem" is a shrink floor, not a
                                target: the role badge gives way first when space
                                runs short, so the name only shrinks past 5rem if
                                there's truly no room for either. */}
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
                        {/* Same ellipsis treatment for the email, which used to grow
                            without bound. flex-grow left at 0: it hugs its own
                            width like the name above it instead of stretching to
                            fill the row. Clicking the avatar opens
                            ProfileDetailsDialog with the untruncated values. */}
                        <HStack gap={2} color="fg.muted" mt={1} minW={0}>
                            <Mail size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
                            <Text fontSize="md" flex="0 1 auto" maxW="100%" truncate title={user.email}>
                                {user.email}
                            </Text>
                        </HStack>
                    </Box>
                </HStack>

                <Separator orientation="vertical" display={{ base: "none", xl: "block" }} flexShrink={0} />

                {/* wrap switches at the same "xl" breakpoint as the outer Flex
                    above, not content-driven wrap="wrap", for the same
                    scrollbar-width reason explained there (it was folding
                    "Active sessions" onto its own line on every
                    ConfirmDialog open/close). */}
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
                                // Date on one line, time on the next: the combined
                                // "Aug 1, 2026, 4:23 PM" string is the widest thing in
                                // this row, so splitting it keeps the column no wider
                                // than "Member since"/"Active sessions" instead of
                                // stretching the whole row.
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
