import React, { useMemo } from "react";
import { HStack, Input, Stack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import StyledSelect from "../ui/StyledSelect";
import { SEARCH_INPUT_PROPS, SEARCH_QUERY_MAX_LENGTH } from "../ui/styles/inputStyles";
import { RATE_LIMIT_ENDPOINTS } from "./rateLimitEndpoints";

export const ALL_VALUE = "";

interface RateLimitsFilterBarProps {
    endpoint: string;
    setEndpoint: (v: string) => void;
    identifier: string;
    setIdentifier: (v: string) => void;
    scope: string;
    setScope: (v: string) => void;
}

/** Same shape as UsersFilterBar/audit_log's *FilterBar components: this owns
 * only the filter controls, RateLimitsPage owns the state and query.
 * `identifier` is a substring match (debounced, like audit_log's search
 * filters), but `endpoint` needs an exact match server-side, so it's a
 * dropdown over RATE_LIMIT_ENDPOINTS instead of free text (a free-text box
 * used to silently return zero rows unless you typed the exact internal id,
 * e.g. "login" not "Login"). Nothing to debounce there: it refetches once an
 * option is picked. */
const RateLimitsFilterBar: React.FC<RateLimitsFilterBarProps> = ({
    endpoint, setEndpoint, identifier, setIdentifier, scope, setScope,
}) => {
    const { t } = useTranslation("rate_limits");

    const endpointOptions = useMemo(
        () => [
            { value: ALL_VALUE, label: t("page.allEndpoints") },
            ...RATE_LIMIT_ENDPOINTS.map((e) => ({ value: e, label: e })),
        ],
        [t]
    );

    return (
        <Stack gap={3}>
            <HStack gap={3} wrap="wrap">
                <StyledSelect
                    w="56"
                    ariaLabel={t("page.filterByEndpoint")}
                    value={endpoint}
                    onChange={setEndpoint}
                    options={endpointOptions}
                />

                <Input
                    placeholder={t("page.identifierPlaceholder")}
                    aria-label={t("page.filterByIdentifier")}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    maxW="sm"
                    maxLength={SEARCH_QUERY_MAX_LENGTH}
                    {...SEARCH_INPUT_PROPS}
                />

                <StyledSelect
                    w="40"
                    ariaLabel={t("page.filterByScope")}
                    value={scope}
                    onChange={setScope}
                    options={[
                        { value: ALL_VALUE, label: t("page.allScopes") },
                        { value: "ip", label: t("page.scopeIp") },
                        { value: "account", label: t("page.scopeAccount") },
                        { value: "email", label: t("page.scopeEmail") },
                    ]}
                />
            </HStack>
        </Stack>
    );
};

export default RateLimitsFilterBar;
