import React from "react";
import { HStack, Input, Stack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import StyledSelect from "../ui/StyledSelect";
import { SEARCH_INPUT_PROPS } from "../ui/styles/inputStyles";
import { AUTHORIZATION_RESOURCE_TYPES } from "../audit_log/authorization_log/authorizationLogResourceTypes";

export const ALL_VALUE = "";

interface PoliciesFilterBarProps {
    search: string;
    setSearch: (v: string) => void;
    resourceType: string;
    setResourceType: (v: string) => void;
    status: string;
    setStatus: (v: string) => void;
    /** Rendered right next to the search input (e.g. Create Policy), so it
     * reads as a sibling action on the search row rather than drifting to
     * the far edge of the page header. */
    searchRowExtra?: React.ReactNode;
}

/** PoliciesPage's search box + resource type/status filters. Split out of
 * PoliciesPage.tsx, same "filter bar as its own component" pattern as
 * UsersFilterBar.tsx and audit_log/*\/*FilterBar.tsx - this owns only the
 * filter controls themselves; PoliciesPage still owns the state and the
 * server-side query it drives. */
const PoliciesFilterBar: React.FC<PoliciesFilterBarProps> = ({
    search, setSearch, resourceType, setResourceType, status, setStatus, searchRowExtra,
}) => {
    const { t } = useTranslation(["policies", "ui_text"]);

    return (
        <Stack gap={3}>
            <HStack gap={3} wrap="wrap">
                <Input
                    placeholder={t("policies:page.searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxW="sm"
                    {...SEARCH_INPUT_PROPS}
                />
                {searchRowExtra}
            </HStack>

            <HStack gap={3} wrap="wrap">
                <StyledSelect
                    w="48"
                    ariaLabel={t("policies:page.filterByResourceType")}
                    value={resourceType}
                    onChange={setResourceType}
                    options={[
                        { value: ALL_VALUE, label: t("policies:page.allResourceTypes") },
                        ...AUTHORIZATION_RESOURCE_TYPES.map((value) => ({ value, label: value })),
                    ]}
                />

                <StyledSelect
                    w="36"
                    ariaLabel={t("policies:page.filterByStatus")}
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: ALL_VALUE, label: t("policies:page.allStatuses") },
                        { value: "true", label: t("ui_text:active") },
                        { value: "false", label: t("ui_text:inactive") },
                    ]}
                />
            </HStack>
        </Stack>
    );
};

export default PoliciesFilterBar;
