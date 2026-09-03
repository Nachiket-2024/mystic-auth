import React from "react";
import { SimpleGrid } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import Card from "../ui/Card";
import StatTile from "../ui/StatTile";
import type { PolicyRead } from "../api/policies_api";

interface PolicyStatsCardProps {
    policies: PolicyRead[] | undefined;
    isLoading: boolean;
}

/**
 * PolicyStatsCard
 * ----------------------------
 * Summary counts for PoliciesPage: total policies, how many are active,
 * distinct actions granted, and distinct resource types. Computed
 * client-side from the full policy list since there's no separate
 * aggregate endpoint (unlike UserStatsCard's server-paginated one). Sits
 * in the header row next to PageContainer's title.
 */
const PolicyStatsCard: React.FC<PolicyStatsCardProps> = ({ policies, isLoading }) => {
    const { t } = useTranslation("policies");
    const totalPolicies = policies?.length;
    const activePolicies = policies?.filter((p) => p.is_active).length;
    const totalActions = policies ? new Set(policies.flatMap((p) => p.actions)).size : undefined;
    const resourceTypes = policies ? new Set(policies.map((p) => p.resource_type)).size : undefined;

    return (
        <Card p={4} w={{ base: "full", md: "72" }}>
            <SimpleGrid columns={2} gap={4}>
                <StatTile label={t("policies:statsCard.totalPolicies")} value={totalPolicies} isLoading={isLoading} color="blue.500" />
                <StatTile label={t("policies:statsCard.active")} value={activePolicies} isLoading={isLoading} color="green.500" />
                <StatTile label={t("policies:statsCard.distinctActions")} value={totalActions} isLoading={isLoading} color="purple.500" />
                <StatTile label={t("policies:statsCard.resourceTypes")} value={resourceTypes} isLoading={isLoading} color="orange.500" />
            </SimpleGrid>
        </Card>
    );
};

export default PolicyStatsCard;
