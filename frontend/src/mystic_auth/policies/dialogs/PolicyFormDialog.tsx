import React, { useMemo, useState } from "react";
import { Button, Dialog, Field, Input, Portal, Stack, Textarea } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { PolicyRead } from "../../api/policies_api";
import FormAlert from "../../ui/FormAlert";
import ConfirmDialog from "../../ui/ConfirmDialog";
import StyledSelect from "../../ui/StyledSelect";
import ActionsMultiSelect from "./ActionsMultiSelect";
import { usePermissionCatalogQuery } from "../queries/permissionQueries";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "../../ui/styles/dialogStyles";
import { BRAND_SOLID_HOVER_PROPS, CLOSE_TRIGGER_PROPS, SECONDARY_BUTTON_PROPS } from "../../ui/styles/buttonStyles";

export interface PolicyFormValues {
    name: string;
    description: string;
    actions: string[];
    resource_type: string;
    conditions?: Record<string, unknown>;
}

interface PolicyFormDialogProps {
    isOpen: boolean;
    /** Present when editing an existing policy; absent when creating. */
    policy?: PolicyRead;
    isSaving: boolean;
    errorMessage: string | null;
    onSubmit: (values: PolicyFormValues) => void;
    onClose: () => void;
}

/**
 * PolicyFormDialog
 * ----------------------------
 * Shared create/edit form for a Policy: one component instead of separate
 * modals, since the fields and validation are identical (see PolicyBase on
 * the backend). `policy` presence alone distinguishes the two modes.
 */
const PolicyFormDialog: React.FC<PolicyFormDialogProps> = ({
    isOpen,
    policy,
    isSaving,
    errorMessage,
    onSubmit,
    onClose,
}) => {
    const { t } = useTranslation(["policies", "ui_text"]);
    const catalogQuery = usePermissionCatalogQuery(isOpen);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [actions, setActions] = useState<string[]>([]);
    const [resourceType, setResourceType] = useState("");
    const [conditionsText, setConditionsText] = useState("");
    const [conditionsError, setConditionsError] = useState<string | null>(null);

    const resourceTypeOptions = useMemo(() => {
        const types = new Set((catalogQuery.data ?? []).map((entry) => entry.resource_type));
        return Array.from(types).map((type) => ({ value: type, label: type }));
    }, [catalogQuery.data]);

    // Actions are scoped to the selected resource type: a policy grants
    // actions against one resource type, so showing every catalog action
    // regardless of selection would let an admin pick a combination no
    // route actually matches.
    const actionOptions = useMemo(() => {
        return (catalogQuery.data ?? [])
            .filter((entry) => entry.resource_type === resourceType)
            .map((entry) => ({ value: entry.action, label: entry.action }));
    }, [catalogQuery.data, resourceType]);

    // Snapshot of every field right after the dialog last opened, compared
    // against current values to detect unsaved edits before a close discards
    // them.
    const [initialSnapshot, setInitialSnapshot] = useState("");

    // Reset the form to the policy being edited (or blank, for create) each
    // time the dialog opens. Done during render, React's documented pattern
    // for state derived from props, since setState-in-effect costs an extra
    // render.
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen && !prevIsOpen) {
        setPrevIsOpen(isOpen);
        const initialName = policy?.name ?? "";
        const initialDescription = policy?.description ?? "";
        const initialActions = policy ? policy.actions : [];
        const initialResourceType = policy?.resource_type ?? "";
        const initialConditionsText = policy?.conditions ? JSON.stringify(policy.conditions, null, 2) : "";

        setName(initialName);
        setDescription(initialDescription);
        setActions(initialActions);
        setResourceType(initialResourceType);
        setConditionsText(initialConditionsText);
        setConditionsError(null);
        setInitialSnapshot(
            JSON.stringify([initialName, initialDescription, initialActions, initialResourceType, initialConditionsText])
        );
    } else if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
    }

    const isDirty =
        JSON.stringify([name, description, actions, resourceType, conditionsText]) !== initialSnapshot;

    // A themed ConfirmDialog, not window.confirm, which is an unstyled
    // native dialog, the only one in an otherwise fully themed app.
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

    // Changing resource type invalidates any selected actions that don't
    // apply to the new one, since actionOptions only offers actions scoped
    // to the current resourceType. Without this, stale selections from the
    // old type would linger in state, unreachable in the UI but still
    // submitted.
    const handleResourceTypeChange = (value: string) => {
        setResourceType(value);
        setActions([]);
    };

    const requestClose = () => {
        if (isDirty) {
            setShowDiscardConfirm(true);
            return;
        }
        onClose();
    };

    const handleSubmit = (e: React.SubmitEvent<HTMLDivElement>) => {
        e.preventDefault();

        let conditions: Record<string, unknown> | undefined;
        if (conditionsText.trim()) {
            try {
                conditions = JSON.parse(conditionsText);
            } catch {
                setConditionsError(t("policies:formDialog.conditionsInvalidJson"));
                return;
            }
        }
        setConditionsError(null);

        onSubmit({
            name,
            description,
            actions,
            resource_type: resourceType,
            conditions,
        });
    };

    return (
        <>
            <Dialog.Root
                open={isOpen}
                onOpenChange={(details) => !details.open && requestClose()}
                closeOnInteractOutside
            >
                <Portal>
                    <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                    <Dialog.Positioner>
                        <Dialog.Content {...DIALOG_CONTENT_PROPS}>
                            <Dialog.Header>
                                <Dialog.Title>{policy ? t("policies:formDialog.editTitle") : t("policies:formDialog.createTitle")}</Dialog.Title>
                            </Dialog.Header>
                            <Dialog.Body>
                                <Stack as="form" id="policy-form" onSubmit={handleSubmit} gap={4}>
                                    <Field.Root required>
                                        <Field.Label>{t("policies:formDialog.name")}</Field.Label>
                                        <Input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder={t("policies:formDialog.namePlaceholder")}
                                            maxLength={100}
                                        />
                                    </Field.Root>

                                    <Field.Root>
                                        <Field.Label>{t("policies:formDialog.description")}</Field.Label>
                                        <Input
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder={t("policies:formDialog.descriptionPlaceholder")}
                                            maxLength={500}
                                        />
                                    </Field.Root>

                                    <Field.Root required>
                                        <Field.Label>{t("policies:formDialog.resourceType")}</Field.Label>
                                        <StyledSelect
                                            ariaLabel={t("policies:formDialog.resourceType")}
                                            placeholder={t("policies:formDialog.resourceTypePlaceholder")}
                                            value={resourceType}
                                            onChange={handleResourceTypeChange}
                                            options={resourceTypeOptions}
                                        />
                                    </Field.Root>

                                    {/* No native `required` here: a required multi-select's
                                        browser validation depends on its <option>s already
                                        matching `values` at submit time, which races the
                                        permission-catalog fetch that populates actionOptions.
                                        Submit is guarded manually instead. */}
                                    <Field.Root>
                                        <Field.Label>{t("policies:formDialog.actions")}</Field.Label>
                                        <ActionsMultiSelect
                                            ariaLabel={t("policies:formDialog.actions")}
                                            placeholder={t("policies:formDialog.actionsPlaceholder")}
                                            values={actions}
                                            onChange={setActions}
                                            options={actionOptions}
                                            disabled={!resourceType}
                                        />
                                        <Field.HelperText>{t("policies:formDialog.actionsHelperText")}</Field.HelperText>
                                    </Field.Root>

                                    <Field.Root invalid={!!conditionsError}>
                                        <Field.Label>{t("policies:formDialog.conditions")}</Field.Label>
                                        <Textarea
                                            value={conditionsText}
                                            onChange={(e) => setConditionsText(e.target.value)}
                                            placeholder={t("policies:formDialog.conditionsPlaceholder")}
                                            rows={4}
                                            fontFamily="mono"
                                        />
                                        {conditionsError && <Field.ErrorText>{conditionsError}</Field.ErrorText>}
                                    </Field.Root>

                                    {errorMessage && <FormAlert status="error">{errorMessage}</FormAlert>}
                                </Stack>
                            </Dialog.Body>
                            <Dialog.Footer>
                                <Button onClick={requestClose} disabled={isSaving} {...SECONDARY_BUTTON_PROPS}>
                                    {t("ui_text:cancel")}
                                </Button>
                                <Button
                                    type="submit"
                                    form="policy-form"
                                    colorPalette="brand"
                                    loading={isSaving}
                                    loadingText={t("ui_text:saving")}
                                    {...BRAND_SOLID_HOVER_PROPS}
                                >
                                    {policy ? t("policies:formDialog.saveChanges") : t("policies:formDialog.createPolicy")}
                                </Button>
                            </Dialog.Footer>
                            {/* Chakra v3's Dialog.CloseTrigger has no default icon; without
                                children it was an empty 0x0 button (axe-core button-name
                                audit caught it). */}
                            <Dialog.CloseTrigger aria-label={t("ui_text:closeDialog")} {...CLOSE_TRIGGER_PROPS}>
                                <X size={16} aria-hidden="true" />
                            </Dialog.CloseTrigger>
                        </Dialog.Content>
                    </Dialog.Positioner>
                </Portal>
            </Dialog.Root>

            <ConfirmDialog
                isOpen={showDiscardConfirm}
                title={t("policies:formDialog.discardTitle")}
                description={t("policies:formDialog.discardDescription")}
                confirmLabel={t("policies:formDialog.discard")}
                onConfirm={() => {
                    setShowDiscardConfirm(false);
                    onClose();
                }}
                onCancel={() => setShowDiscardConfirm(false)}
            />
        </>
    );
};

export default PolicyFormDialog;
