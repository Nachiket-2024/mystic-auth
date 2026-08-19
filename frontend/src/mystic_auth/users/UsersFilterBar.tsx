import React from "react";
import { HStack, Input, Stack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import StyledSelect from "../ui/StyledSelect";
import { SEARCH_INPUT_PROPS } from "../ui/styles/inputStyles";
import { ROLE_OPTIONS, capitalize } from "./usersColumns";

export const ALL_VALUE = "";

interface UsersFilterBarProps {
    search: string;
    setSearch: (v: string) => void;
    role: string;
    setRole: (v: string) => void;
    verified: string;
    setVerified: (v: string) => void;
    status: string;
    setStatus: (v: string) => void;
    /** Rendered right next to the search input (e.g. Export CSV), so it
     * reads as a sibling action on the search row rather than drifting to
     * the far edge of the page header. */
    searchRowExtra?: React.ReactNode;
}

/** UsersPage's search box + role/verified/status filters. Split out of
 * UsersPage.tsx, same "filter bar as its own component" pattern as
 * audit_log/*\/*FilterBar.tsx - this owns only the filter controls
 * themselves; UsersPage still owns the state and the server-side query it
 * drives. */
const UsersFilterBar: React.FC<UsersFilterBarProps> = ({
    search, setSearch, role, setRole, verified, setVerified, status, setStatus, searchRowExtra,
}) => {
    const { t } = useTranslation(["users", "ui_text"]);

    return (
        <Stack gap={3}>
            <HStack gap={3} wrap="wrap">
                <Input
                    placeholder={t("users:page.searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxW="sm"
                    {...SEARCH_INPUT_PROPS}
                />
                {searchRowExtra}
            </HStack>

            <HStack gap={3} wrap="wrap">
                <StyledSelect
                    w="36"
                    ariaLabel={t("users:page.filterByRole")}
                    value={role}
                    onChange={setRole}
                    textTransform="capitalize"
                    options={[
                        { value: ALL_VALUE, label: t("users:page.allRoles") },
                        ...ROLE_OPTIONS.map((value) => ({ value, label: capitalize(value) })),
                    ]}
                />

                <StyledSelect
                    w="44"
                    ariaLabel={t("users:page.filterByVerified")}
                    value={verified}
                    onChange={setVerified}
                    options={[
                        { value: ALL_VALUE, label: t("users:page.allVerification") },
                        { value: "true", label: t("users:page.verified") },
                        { value: "false", label: t("users:page.unverified") },
                    ]}
                />

                <StyledSelect
                    w="36"
                    ariaLabel={t("users:page.filterByStatus")}
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: ALL_VALUE, label: t("users:page.allStatuses") },
                        { value: "active", label: t("ui_text:active") },
                        { value: "inactive", label: t("ui_text:inactive") },
                        { value: "deleted", label: t("users:page.deleted") },
                    ]}
                />
            </HStack>
        </Stack>
    );
};

export default UsersFilterBar;
