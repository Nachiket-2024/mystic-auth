import React from "react";
import { HStack, Input, Stack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import StyledSelect from "../ui/StyledSelect";
import { SEARCH_INPUT_PROPS, SEARCH_QUERY_MAX_LENGTH } from "../ui/styles/inputStyles";
import { AUTHORIZATION_RESOURCE_TYPES } from "../audit_log/authorization_log/authorizationLogResourceTypes";

export const ALL_VALUE = "";

interface PermissionsFilterBarProps {
    search: string;
    setSearch: (v: string) => void;
    resourceType: string;
    setResourceType: (v: string) => void;
}

/** PermissionsPage's search box + resource-type filter. Same pattern as
 * PoliciesFilterBar.tsx, minus the status filter since catalog entries have
 * no active/inactive state. */
const PermissionsFilterBar: React.FC<PermissionsFilterBarProps> = ({ search, setSearch, resourceType, setResourceType }) => {
    const { t } = useTranslation(["permissions", "ui_text"]);

    return (
        <Stack gap={3}>
            <HStack gap={3} wrap="wrap">
                <Input
                    placeholder={t("permissions:page.searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxW="sm"
                    maxLength={SEARCH_QUERY_MAX_LENGTH}
                    {...SEARCH_INPUT_PROPS}
                />
            </HStack>

            <HStack gap={3} wrap="wrap">
                <StyledSelect
                    w="48"
                    ariaLabel={t("permissions:page.filterByResourceType")}
                    value={resourceType}
                    onChange={setResourceType}
                    options={[
                        { value: ALL_VALUE, label: t("permissions:page.allResourceTypes") },
                        ...AUTHORIZATION_RESOURCE_TYPES.filter((v) => v !== "*").map((value) => ({ value, label: value })),
                    ]}
                />
            </HStack>
        </Stack>
    );
};

export default PermissionsFilterBar;
