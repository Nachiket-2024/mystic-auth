import React from "react";
import { Button, HStack, Text } from "@chakra-ui/react";
import { MousePointerClick, ShieldCheck, Key, UserCog, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IfCan } from "../../authorization/IfCan";
import { PERMISSIONS } from "../../authorization/permissions";
import { BRAND_OUTLINE_HOVER_PROPS, BRAND_SOLID_HOVER_PROPS, SECONDARY_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

interface BulkActionToolbarProps {
    selectedCount: number;
    onBulkAssignPolicy: () => void;
    onBulkGrantPermission: () => void;
    onBulkSetRole: () => void;
    onClearSelection: () => void;
    /** Whether clicking anywhere in a row toggles selection. Caller-owned,
     * not always on, since always-on would fight double-click/drag-select
     * of cell text. See DataTable's `rowClickSelects` doc. */
    rowClickSelects: boolean;
    onToggleRowClickSelects: () => void;
}

/** Renders above the users table. Buttons are disabled, not hidden, while
 * nothing is selected, so bulk actions are discoverable up front. Each
 * button opens the matching Bulk*Dialog, fanning one chosen
 * policy/permission/role out across every selected user. */
const BulkActionToolbar: React.FC<BulkActionToolbarProps> = ({
    selectedCount, onBulkAssignPolicy, onBulkGrantPermission, onBulkSetRole, onClearSelection,
    rowClickSelects, onToggleRowClickSelects,
}) => {
    const { t } = useTranslation(["users", "ui_text"]);
    const noSelection = selectedCount === 0;

    return (
        <HStack justify="space-between" gap={2} mb={3} wrap="wrap">
            <Text fontSize="md" color="fg.muted">
                {t("ui_text:selectedCount", { count: selectedCount })}
            </Text>
            <HStack gap={2} wrap="wrap">
                <Button
                    size="sm"
                    variant={rowClickSelects ? "solid" : "outline"}
                    colorPalette="brand"
                    // Constant borderWidth in both states, or the button
                    // visibly resizes on toggle since solid's default border
                    // is 0. borderColor uses brand.fg (same token as the
                    // text color) instead of BRAND_OUTLINE_HOVER_PROPS's
                    // lighter default, so outline and label match.
                    borderWidth="2px"
                    {...(rowClickSelects ? BRAND_SOLID_HOVER_PROPS : BRAND_OUTLINE_HOVER_PROPS)}
                    borderColor={rowClickSelects ? "brand.solid" : "brand.fg"}
                    onClick={onToggleRowClickSelects}
                    aria-pressed={rowClickSelects}
                    title={t("users:bulkActions.rowClickSelectTitle")}
                >
                    <MousePointerClick size={14} aria-hidden="true" />
                    {t("users:bulkActions.rowClickSelect")}
                </Button>
                <IfCan action={PERMISSIONS.POLICIES_ASSIGN}>
                    <Button size="sm" colorPalette="brand" onClick={onBulkAssignPolicy} disabled={noSelection} {...BRAND_SOLID_HOVER_PROPS}>
                        <ShieldCheck size={14} aria-hidden="true" />
                        {t("users:bulkActions.assignPolicy")}
                    </Button>
                </IfCan>
                <IfCan action={PERMISSIONS.PERMISSIONS_GRANT}>
                    <Button size="sm" colorPalette="brand" onClick={onBulkGrantPermission} disabled={noSelection} {...BRAND_SOLID_HOVER_PROPS}>
                        <Key size={14} aria-hidden="true" />
                        {t("users:bulkActions.grantPermission")}
                    </Button>
                </IfCan>
                <IfCan action={PERMISSIONS.USERS_ASSIGN_ROLE}>
                    <Button size="sm" colorPalette="brand" onClick={onBulkSetRole} disabled={noSelection} {...BRAND_SOLID_HOVER_PROPS}>
                        <UserCog size={14} aria-hidden="true" />
                        {t("users:bulkActions.setRole")}
                    </Button>
                </IfCan>
                <Button size="sm" onClick={onClearSelection} disabled={noSelection} {...SECONDARY_BUTTON_PROPS}>
                    <X size={14} aria-hidden="true" />
                    {t("ui_text:clearSelection")}
                </Button>
            </HStack>
        </HStack>
    );
};

export default BulkActionToolbar;
