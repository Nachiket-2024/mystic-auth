import React, { useState } from "react";
import { Button, Dialog, Portal } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DIALOG_BACKDROP_PROPS, DIALOG_CONTENT_PROPS } from "./styles/dialogStyles";
import { BRAND_SOLID_HOVER_PROPS, CLOSE_TRIGGER_PROPS, DESTRUCTIVE_SOLID_HOVER_PROPS, SECONDARY_BUTTON_PROPS } from "./styles/buttonStyles";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    isDestructive?: boolean;
    isLoading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Shared confirmation modal for destructive/irreversible management actions
 * (delete policy, delete user, revoke a policy assignment) so none of those
 * flows fire on a single accidental click. Controlled entirely by the
 * caller (isOpen/onConfirm/onCancel) rather than owning its own open state,
 * so the caller can tie it to whichever row/action triggered it.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    description,
    confirmLabel,
    isDestructive = true,
    isLoading = false,
    onConfirm,
    onCancel,
}) => {
    const { t } = useTranslation("ui_text");

    // Callers often clear their title/description/confirmLabel source the
    // same tick they flip isOpen to false, but this dialog keeps rendering
    // through its ~150ms close animation. Freezing the last real content
    // avoids a flash of empty text during that exit transition.
    //
    // State, not a ref: React's "adjust state during render" pattern -
    // setShown re-renders immediately with the new value, then bails out
    // once it already matches, so it can't loop.
    const [shown, setShown] = useState({ title, description, confirmLabel });
    if (isOpen && (shown.title !== title || shown.description !== description || shown.confirmLabel !== confirmLabel)) {
        setShown({ title, description, confirmLabel });
    }

    return (
        <Dialog.Root
            open={isOpen}
            onOpenChange={(details) => !details.open && onCancel()}
            role="alertdialog"
            closeOnInteractOutside
        >
            <Portal>
                <Dialog.Backdrop {...DIALOG_BACKDROP_PROPS} />
                <Dialog.Positioner>
                    <Dialog.Content {...DIALOG_CONTENT_PROPS}>
                        <Dialog.Header>
                            <Dialog.Title>{shown.title}</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            {/* Dialog.Description (not plain Text) so Ark UI wires
                                aria-describedby, so a screen reader announcing this
                                alertdialog reads the warning text too, not just the title. */}
                            <Dialog.Description color="fg.muted" fontSize="md">{shown.description}</Dialog.Description>
                        </Dialog.Body>
                        <Dialog.Footer>
                            <Button onClick={onCancel} disabled={isLoading} {...SECONDARY_BUTTON_PROPS}>
                                {t("cancel")}
                            </Button>
                            <Button
                                colorPalette={isDestructive ? "red" : "brand"}
                                onClick={onConfirm}
                                loading={isLoading}
                                {...(isDestructive ? DESTRUCTIVE_SOLID_HOVER_PROPS : BRAND_SOLID_HOVER_PROPS)}
                            >
                                {shown.confirmLabel ?? t("confirm")}
                            </Button>
                        </Dialog.Footer>
                        {/* Chakra v3's Dialog.CloseTrigger renders no icon of its own -
                            without explicit children it was an empty 0x0 button. */}
                        <Dialog.CloseTrigger aria-label={t("closeDialog")} {...CLOSE_TRIGGER_PROPS}>
                            <X size={16} aria-hidden="true" />
                        </Dialog.CloseTrigger>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    );
};

export default ConfirmDialog;
