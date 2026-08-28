import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useUserPoliciesQuery, useMyPoliciesQuery, usePoliciesQuery } from "../../policies/queries/policyQueries";
import { useUserPermissionsQuery, useMyPermissionsQuery } from "../../policies/queries/permissionQueries";
import {
    useAssignPolicyMutation,
    useRevokePolicyMutation,
    useRevokePolicyActionMutation,
} from "../../policies/queries/policyMutations";
import { buildEffectiveGrantKeySet, policyAddsNothingNew } from "../../policies/logic/effectiveGrants";
import { toaster } from "../../ui/toaster/toasterInstance";
import { useAuthStore } from "../../store/authStore";

/**
 * useUserPoliciesDialogState
 * ----------------------------
 * All query selection (management vs. self-service /me endpoints, per
 * UserPermissionsDialog's matching switch) and mutation/handler logic for
 * UserPoliciesDialog, split out so that file stays composition + JSX. See
 * UserPoliciesDialog's own docstring for what this dialog is for.
 */
export function useUserPoliciesDialogState(isOpen: boolean, userEmail: string | null) {
    const { t } = useTranslation(["users", "ui_text"]);
    const [selectedPolicy, setSelectedPolicy] = useState("");
    const [revokingPolicy, setRevokingPolicy] = useState<string | null>(null);
    const [revokingAction, setRevokingAction] = useState<{ policyName: string; action: string } | null>(null);
    const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());

    // Reset on every open (same "adjust during render" pattern as
    // PolicyFormDialog.tsx, not an effect, to avoid an extra render). Without
    // this, dismissing the dialog mid-flow (e.g. via backdrop/Escape without
    // confirming) leaves stale state behind, so reopening for a different
    // user could pre-select a stale policy or pop the revoke confirm dialog
    // unprompted, describing the wrong user.
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setSelectedPolicy("");
            setRevokingPolicy(null);
            setRevokingAction(null);
            setExpandedPolicies(new Set());
        }
    }

    const currentUserEmail = useAuthStore((s) => s.email);
    // Revoking your OWN policy here has no confirmation and no
    // /auth/me refetch of its own: the Zustand permissions cache (source
    // for every IfCan/ProtectedRoute check) would stay stale until the
    // next reload, so a self-revoke could silently strand you in a UI that
    // still shows controls you no longer have access to. Simplest safe
    // fix, consistent with UsersPage's existing self-delete/self-role-edit
    // guards: block self-revoke entirely from this dialog.
    const isSelf = !!userEmail && userEmail === currentUserEmail;

    // Own row = self-service /me endpoints, not the management ones (see
    // UserPermissionsDialog's matching switch) - regardless of holding
    // policies:read/permissions:read here, since a caller always has access
    // to their own /me endpoints.
    const managementPoliciesQuery = useUserPoliciesQuery(userEmail ?? "", isOpen && !!userEmail && !isSelf);
    const myPoliciesQuery = useMyPoliciesQuery(isOpen && isSelf);
    const userPoliciesQuery = isSelf ? myPoliciesQuery : managementPoliciesQuery;
    // usePoliciesQuery has no enabled guard of its own, and this dialog stays
    // mounted (just hidden) the whole time UsersPage is open - without gating
    // it here, every visit to /users fetched the full policies list even if
    // this dialog was never opened for any user.
    const allPoliciesQuery = usePoliciesQuery(isOpen);
    // Fetched so the assign dropdown can exclude a policy that adds nothing
    // the user doesn't already effectively hold via a direct grant, not just
    // via another already-assigned policy - see effectiveGrants.ts.
    const managementPermissionsQuery = useUserPermissionsQuery(userEmail ?? "", isOpen && !!userEmail && !isSelf);
    const myPermissionsQuery = useMyPermissionsQuery(isOpen && isSelf);
    const userPermissionsQuery = isSelf ? myPermissionsQuery : managementPermissionsQuery;
    const assignMutation = useAssignPolicyMutation();
    const revokeMutation = useRevokePolicyMutation();
    const revokeActionMutation = useRevokePolicyActionMutation();

    const assignedPolicies = userPoliciesQuery.data?.policies ?? [];
    const assignedNames = new Set(assignedPolicies.map((p) => p.name));
    const effectiveGrantKeys = buildEffectiveGrantKeySet(assignedPolicies, userPermissionsQuery.data?.permissions ?? []);
    const availableToAssign = (allPoliciesQuery.data ?? []).filter(
        (p) => !assignedNames.has(p.name) && !policyAddsNothingNew(p, effectiveGrantKeys)
    );

    const togglePolicyExpanded = (policyName: string) => {
        setExpandedPolicies((prev) => {
            const next = new Set(prev);
            if (next.has(policyName)) {
                next.delete(policyName);
            } else {
                next.add(policyName);
            }
            return next;
        });
    };

    const expandAll = () => setExpandedPolicies(new Set(assignedPolicies.map((p) => p.name)));
    const collapseAll = () => setExpandedPolicies(new Set());

    const handleAssign = () => {
        if (!userEmail || !selectedPolicy) return;
        assignMutation.mutate(
            { userEmail, policyName: selectedPolicy },
            {
                onSuccess: () => {
                    toaster.create({ title: t("users:policiesDialog.assignedToast", { policyName: selectedPolicy }), type: "success" });
                    setSelectedPolicy("");
                },
                onError: (error) => toaster.create({ title: error.message, type: "error" }),
            }
        );
    };

    const handleRevokeConfirm = () => {
        if (!userEmail || !revokingPolicy) return;
        const policyName = revokingPolicy;
        revokeMutation.mutate(
            { userEmail, policyName },
            {
                onSuccess: () => {
                    toaster.create({ title: t("users:policiesDialog.revokedToast", { policyName }), type: "success" });
                    setRevokingPolicy(null);
                },
                onError: (error) => {
                    toaster.create({ title: error.message, type: "error" });
                    setRevokingPolicy(null);
                },
            }
        );
    };

    const handleRevokeActionConfirm = () => {
        if (!userEmail || !revokingAction) return;
        const { policyName, action } = revokingAction;
        revokeActionMutation.mutate(
            { userEmail, policyName, action },
            {
                onSuccess: () => {
                    toaster.create({ title: t("users:policiesDialog.actionRevokedToast", { action, policyName }), type: "success" });
                    setRevokingAction(null);
                },
                onError: (error) => {
                    toaster.create({ title: error.message, type: "error" });
                    setRevokingAction(null);
                },
            }
        );
    };

    return {
        isSelf,
        userPoliciesQuery,
        assignedPolicies,
        availableToAssign,
        selectedPolicy,
        setSelectedPolicy,
        revokingPolicy,
        setRevokingPolicy,
        revokingAction,
        setRevokingAction,
        expandedPolicies,
        togglePolicyExpanded,
        expandAll,
        collapseAll,
        assignMutation,
        revokeMutation,
        revokeActionMutation,
        handleAssign,
        handleRevokeConfirm,
        handleRevokeActionConfirm,
    };
}
