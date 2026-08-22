import React from "react";
import { Box, HStack, Text } from "@chakra-ui/react";

interface DashboardStatItemProps {
    icon: React.ReactNode;
    label: string;
    /** A plain string renders as one line; Last login passes a two-line
     * (date, then time) node instead - see DashboardIdentityCard's Last
     * login usage. */
    value: React.ReactNode;
}

/** One "label + value" cell in DashboardIdentityCard's stats row, label on
 * top (small, muted, matching a typical stat-card convention) with the
 * actual value underneath as the primary read. */
const DashboardStatItem: React.FC<DashboardStatItemProps> = ({ icon, label, value }) => (
    <Box textAlign="center" flexShrink={0}>
        <HStack gap={1} justify="center" color="fg.muted" whiteSpace="nowrap">
            {icon}
            <Text fontSize="sm" fontWeight="semibold" textTransform="uppercase" letterSpacing="wide" whiteSpace="nowrap">
                {label}
            </Text>
        </HStack>
        <Box color="fg.default" mt={1}>
            {value}
        </Box>
    </Box>
);

export default DashboardStatItem;
