import React from "react";
import { Box, Flex, HStack, Heading, Text } from "@chakra-ui/react";
import type { LucideIcon } from "lucide-react";

import Breadcrumbs, { type BreadcrumbEntry } from "./Breadcrumbs";

interface PageContainerProps {
    title: string;
    /** Renders a Breadcrumbs trail above the title when given a non-empty
     * array - omit for no breadcrumb bar, which every current page uses
     * (the built-in nav is flat, no nested detail routes yet). Wired here so
     * the first nested/detail page can adopt it without a new pattern. */
    breadcrumbs?: BreadcrumbEntry[];
    /** Same lucide-react icon assigned to this feature's NavItem
     * (navItems.ts), so the sidebar entry and page title share one glyph.
     * Optional - omit for a bare text title. */
    icon?: LucideIcon;
    description?: string;
    /** Right-aligned slot next to the heading, typically a primary action
     * button or a summary/stats card. */
    actions?: React.ReactNode;
    /** Extra content rendered below the title/description, in the same
     * left-hand column, so it stacks beneath the title while staying in the
     * same header row as `actions`. Use this instead of `children` when
     * `actions` is tall (e.g. a stats card) and this content (a search
     * bar/filter row) should sit beside it, not below its full height. */
    headerExtra?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Consistent heading/description/action-slot layout for every management
 * page (Users, Policies, Audit Log, Account Settings) so they share one
 * page-header rhythm instead of each hand-rolling its own Heading + Flex.
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
