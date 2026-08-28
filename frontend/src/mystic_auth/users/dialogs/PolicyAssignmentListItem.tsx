import React from "react";
import { Box, HStack, IconButton, Text, Wrap } from "@chakra-ui/react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import Badge from "../../ui/Badge";
import { IfCan } from "../../authorization/IfCan";
import { PERMISSIONS } from "../../authorization/permissions";
import { FAST_HOVER_TRANSITION } from "../../theme/system";
import type { PolicyRead } from "../../api/policies_api";

interface PolicyAssignmentListItemProps {
    policy: PolicyRead;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    isSelf: boolean;
    /** True when the target holds the reserved system role: the backend
     * rejects every revoke against it, same reasoning as isSelf but with its
     * own tooltip copy (see UserPoliciesDialog's own doc on this prop). */
    isSystemUser: boolean;
    onRevokePolicy: () => void;
    isRevokePolicyPending: boolean;
    onRevokeAction: (action: string) => void;
    isRevokeActionPending: (action: string) => boolean;
}

/**
 * PolicyAssignmentListItem
 * ----------------------------
 * One assigned policy's row within UserPoliciesDialog: the collapsed badge
 * (name + expand toggle + top-level revoke) plus, once expanded, every
 * individual action it grants with its own independently-revocable X (see
 * revokePolicyActionApi's own docstring for why revoking just one action is
 * a distinct operation from revoking the whole policy).
 */
const PolicyAssignmentListItem: React.FC<PolicyAssignmentListItemProps> = ({
    policy,
    isExpanded,
    onToggleExpanded,
    isSelf,
    isSystemUser,
    onRevokePolicy,
    isRevokePolicyPending,
    onRevokeAction,
    isRevokeActionPending,
}) => {
    const { t } = useTranslation(["users", "ui_text"]);
    const revokeDisabled = isSelf || isSystemUser;
    const revokeDisabledTitle = isSelf
        ? t("users:policiesDialog.cannotRevokeOwnTitle")
        : isSystemUser
          ? t("users:columns.cannotModifySystemUser")
          : undefined;

    return (
        <Box w="full">
            <Badge colorPalette="brand" variant="subtle" size="md" px={2} py={1} maxW="16rem">
                {/* maxW + truncate on the name (not the whole Badge) so a
                    long policy name ellipsizes instead of growing this one
                    chip - and its embedded revoke button with it - wide
                    enough to spill past the dialog's own edge. */}
                <HStack gap={1} minW={0}>
                    {/* IconButton, not a plain Button wrapping only an icon: Button
                        reserves horizontal padding sized for a text label even with
                        no text child, which both left a visible gap around the glyph
                        and ate into the space truncate had left for the policy name
                        itself (see the maxW bump above) - same fix
                        TableActionIconButton already uses for this exact reason. */}
                    <IconButton
                        size="2xs"
                        variant="ghost"
                        flexShrink={0}
                        aria-label={
                            isExpanded
                                ? t("users:policiesDialog.collapseActionsAriaLabel", { policyName: policy.name })
                                : t("users:policiesDialog.expandActionsAriaLabel", { policyName: policy.name })
                        }
                        onClick={onToggleExpanded}
                    >
                        {isExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                    </IconButton>
                    <Text flex="1 1 auto" minW={0} maxW="100%" truncate title={policy.name}>{policy.name}</Text>
                    <IfCan action={PERMISSIONS.POLICIES_REVOKE}>
                        <IconButton
                            size="2xs"
                            variant="ghost"
                            flexShrink={0}
                            aria-label={t("users:policiesDialog.revokeAriaLabel", { policyName: policy.name })}
                            onClick={onRevokePolicy}
                            disabled={revokeDisabled}
                            title={revokeDisabledTitle}
                            loading={isRevokePolicyPending}
                            // Plain ghost is invisible at rest and its stock hover is
                            // too faint against the brand badge it sits in - same
                            // "reads as a static glyph, not a button" issue
                            // ICON_BUTTON_PROPS/PasswordInput's toggle fix elsewhere.
                            // Red tint (not gray) since this is the destructive
                            // revoke action, echoing TableActionButton's red palette.
                            _hover={{ bg: "red.100", color: "fg.error" }}
                            _dark={{ _hover: { bg: "red.900" } }}
                            transition={FAST_HOVER_TRANSITION}
                        >
                            <X size={12} aria-hidden="true" />
                        </IconButton>
                    </IfCan>
                </HStack>
            </Badge>
            {isExpanded && (
                <Wrap gap={2} mt={1} ml={6}>
                    {/* teal, not brand: matches AccountStatusCard's own color coding
                        (Policies=brand, Effective permissions=teal, Direct
                        permissions=purple) - these are the individual actions a policy
                        grants, the same kind of thing as that card's teal "Effective
                        permissions" badges, not a second policy-name badge. size/no
                        fontSize override so this reads at the same text size as the
                        policy-name badge above it, not larger. */}
                    {policy.actions.map((action) => (
                        <Badge key={action} colorPalette="teal" variant="subtle" size="md" px={2} py={1} maxW="16rem">
                            <HStack gap={1} minW={0}>
                                <Text flex="1 1 auto" minW={0} maxW="100%" truncate title={action}>{action}</Text>
                                <IfCan action={PERMISSIONS.POLICIES_REVOKE}>
                                    <IconButton
                                        size="2xs"
                                        variant="ghost"
                                        flexShrink={0}
                                        aria-label={t("users:policiesDialog.revokeActionAriaLabel", { action, policyName: policy.name })}
                                        title={revokeDisabledTitle ?? t("users:policiesDialog.revokeActionTitle")}
                                        onClick={() => onRevokeAction(action)}
                                        disabled={revokeDisabled}
                                        loading={isRevokeActionPending(action)}
                                        _hover={{ bg: "red.100", color: "fg.error" }}
                                        _dark={{ _hover: { bg: "red.900" } }}
                                        transition={FAST_HOVER_TRANSITION}
                                    >
                                        <X size={12} aria-hidden="true" />
                                    </IconButton>
                                </IfCan>
                            </HStack>
                        </Badge>
                    ))}
                </Wrap>
            )}
        </Box>
    );
};

export default PolicyAssignmentListItem;
