import React, { useMemo } from "react";
import { HStack, Input, Stack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import StyledSelect from "../ui/StyledSelect";
import { SEARCH_INPUT_PROPS } from "../ui/styles/inputStyles";
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

/** Same shape as UsersFilterBar/audit_log's *FilterBar components: this
 * owns only the filter controls, RateLimitsPage owns the state and the
 * query it drives. Unlike `identifier` (a substring match, server-side via
 * rate_limiter_service.list_active_limits, so RateLimitsPage debounces it
 * same as audit_log's ipAddress/search filters), `endpoint` here is an
 * exact match, same as the scope select below it - it's a dropdown over
 * RATE_LIMIT_ENDPOINTS (the fixed, known set of values the backend can
 * actually match) rather than free text, so there's nothing to debounce:
 * the page only refetches once an option is picked. A free-text box here
 * used to silently return zero rows for anything but an exact internal
 * endpoint id (e.g. "Login" or "signin" instead of "login"), which read as
 * the filter being broken. */
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
