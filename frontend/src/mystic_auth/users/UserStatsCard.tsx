import React from "react";
import { SimpleGrid } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import Card from "../ui/Card";
import StatTile from "../ui/StatTile";
import { useUserStatsQuery } from "./queries/userQueries";

interface UserStatsCardProps {
    /** Clears every filter, showing the unfiltered full list. */
    onFilterTotal?: () => void;
    /** Filters the table to verified users only. */
    onFilterVerified?: () => void;
    /** Filters the table to unverified users only. */
    onFilterUnverified?: () => void;
    /** Filters the table to inactive users only. */
    onFilterInactive?: () => void;
}

/**
 * UserStatsCard
 * ----------------------------
 * Summary counts (GET /users/stats) for UsersPage: total, verified,
 * unverified, inactive. Always reflects the whole table, not whatever
 * page/search/filters are currently applied, so the numbers don't shift as
 * an operator pages or filters through the list. Sits in PageContainer's
 * actions slot (top-right, level with the page title).
 *
 * Each tile also acts as a filter shortcut when its handler is supplied:
 * clicking "Verified" applies the same filter as the Verified select below.
 */
const UserStatsCard: React.FC<UserStatsCardProps> = ({
    onFilterTotal, onFilterVerified, onFilterUnverified, onFilterInactive,
}) => {
    const { t } = useTranslation("users");
    const { data, isLoading, isError } = useUserStatsQuery();

    if (isError) return null;

    return (
        <Card p={4} w={{ base: "full", md: "72" }}>
            <SimpleGrid columns={2} gap={4}>
                <StatTile
                    label={t("users:statsCard.totalUsers")} value={data?.total} isLoading={isLoading} onClick={onFilterTotal}
                    ariaLabel={t("users:statsCard.filterTotal")}
                />
                <StatTile
                    label={t("users:statsCard.verified")} value={data?.verified} isLoading={isLoading} color="green.500"
                    onClick={onFilterVerified} ariaLabel={t("users:statsCard.filterVerified")}
                />
                <StatTile
                    label={t("users:statsCard.unverified")} value={data?.unverified} isLoading={isLoading} color="yellow.500"
                    onClick={onFilterUnverified} ariaLabel={t("users:statsCard.filterUnverified")}
                />
                <StatTile
                    label={t("users:statsCard.inactive")} value={data?.inactive} isLoading={isLoading} color="red.500"
                    onClick={onFilterInactive} ariaLabel={t("users:statsCard.filterInactive")}
                />
            </SimpleGrid>
        </Card>
    );
};

export default UserStatsCard;
