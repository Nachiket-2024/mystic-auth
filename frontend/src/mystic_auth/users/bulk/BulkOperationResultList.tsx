import React from "react";
import { HStack, Stack, Text } from "@chakra-ui/react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { BulkItemResult } from "../../api/bulkAssignment_api";

interface BulkOperationResultListProps {
    results: BulkItemResult[];
}

/** Renders one bulk mutation's per-item outcome (BulkItemResult[]): which
 * of the selected users succeeded vs. errored, and why. Used by
 * BulkPolicyAssignDialog / BulkPermissionGrantDialog / BulkRoleAssignDialog
 * after a submit, since a bulk operation is best-effort - a single
 * success/error toast can't represent "18 succeeded, 2 failed". */
const BulkOperationResultList: React.FC<BulkOperationResultListProps> = ({ results }) => {
    const { t } = useTranslation("users");
    if (results.length === 0) return null;

    return (
        <Stack gap={1} maxH="12rem" overflowY="auto">
            {results.map((r) => (
                <HStack key={`${r.user_email}:${r.identifier}`} gap={2} fontSize="sm">
                    {r.status === "error" ? (
                        <XCircle size={14} color="var(--chakra-colors-red-500)" aria-hidden="true" />
                    ) : (
                        <CheckCircle2 size={14} color="var(--chakra-colors-green-500)" aria-hidden="true" />
                    )}
                    <Text truncate>{r.user_email}</Text>
                    {r.status === "error" && (
                        <Text color="fg.error" truncate>
                            {r.error}
                        </Text>
                    )}
                    {/* "already_held" is a genuine no-op the backend reports
                        separately from "success" (see BulkPolicyAssignDialog's
                        matching test comment) - shown here since the picker
                        itself never filters this out across a multi-user
                        selection. */}
                    {r.status === "already_held" && (
                        <Text color="fg.muted" truncate>
                            {t("users:bulkActions.alreadyHeld")}
                        </Text>
                    )}
                </HStack>
            ))}
        </Stack>
    );
};

export default BulkOperationResultList;
