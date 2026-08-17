import React from "react";
import { Box, Flex, HStack, Heading, Text } from "@chakra-ui/react";
import type { LucideIcon } from "lucide-react";

import Breadcrumbs, { type BreadcrumbEntry } from "./Breadcrumbs";

interface PageContainerProps {
    title: string;
    /** Renders a Breadcrumbs trail above the title when given a non-empty
     * array - omit entirely (the default) for no breadcrumb bar, which is
     * every current page in this template: the built-in nav (Dashboard/
     * Users/Policies/Audit Log/Account Settings) is flat, with no nested
     * detail routes yet, so a breadcrumb next to the page title would just
     * repeat it. Wired here so the first nested/detail page (e.g. a user's
     * own detail view reached from Users) can adopt it without inventing a
     * new pattern. */
    breadcrumbs?: BreadcrumbEntry[];
    /** Same lucide-react icon assigned to this feature's NavItem
     * (navItems.ts), so the sidebar entry and this page's own title show
     * the identical glyph rather than two different icons for one feature.
     * Optional - omit for a bare text title, same as before this prop
     * existed. */
    icon?: LucideIcon;
    description?: string;
    /** Right-aligned slot next to the heading, typically a primary action
     * button or a summary/stats card. */
    actions?: React.ReactNode;
    /** Extra content rendered directly below the title/description, but
     * still inside the same left-hand column as those - so it stacks
     * beneath the title while staying in the same header row as `actions`.
     * Use this (rather than putting the same content in `children`) when
     * `actions` is tall (e.g. a stats card) and this content should sit
     * beside it - a search bar/filter row, for instance - instead of
     * being pushed below the actions block's full height. */
    headerExtra?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Consistent heading/description/action-slot layout for every management page
 * (Users, Policies, Audit Log, Account Settings) so they share the same page-header
 * rhythm instead of each hand-rolling its own Heading + Flex.
 */
const PageContainer: React.FC<PageContainerProps> = ({
    title,
    icon: Icon,
    breadcrumbs,
    description,
    actions,
    headerExtra,
    children,
}) => {
    return (
        <Box maxW="container.xl" mx="auto" w="full">
            {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
            <Flex
                justify="space-between"
                align="stretch"
                direction={{ base: "column", sm: "row" }}
                gap={4}
                mb="density.sectionGap"
            >
                <Box flex="1" minW={0} display="flex" flexDirection="column" justifyContent="space-between">
                    <Box>
                        <HStack gap={2.5}>
                            {Icon && <Icon size={22} aria-hidden="true" color="var(--chakra-colors-fg-muted)" />}
                            <Heading as="h1" size="xl" color="fg.default" textStyle="pageTitle">
                                {title}
                            </Heading>
                        </HStack>
                        {description && (
                            <Text color="fg.muted" mt={1} fontSize="md">
                                {description}
                            </Text>
                        )}
                    </Box>
                    {headerExtra && <Box mt={4}>{headerExtra}</Box>}
                </Box>
                {actions && <Box>{actions}</Box>}
            </Flex>
            {children}
        </Box>
    );
};

export default PageContainer;
