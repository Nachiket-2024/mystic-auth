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

    // Most callers clear the row/entry backing title/description/confirmLabel
    // (e.g. setResettingEntry(null)) the same tick they flip isOpen to false,
    // so a caller can reset its own state right on success without knowing
    // this dialog keeps rendering through its own close animation. Freezing
    // the last real content while isOpen is true - and holding that frozen
    // snapshot once it goes false - keeps the dialog showing what the user
    // actually confirmed instead of a flash of "" (or "undefined") text
    // during the ~150ms exit transition.
    //
    // State, not a ref: React's own "adjusting state during render" pattern
    // (https://react.dev/learn/you-might-not-need-an-effect) - reading a
    // ref's .current during render is disallowed (react-hooks/refs), since
    // the render function isn't supposed to depend on a value React can't
    // see change. Calling setShown conditionally, right here in the render
    // body, is the sanctioned replacement: it re-renders immediately with
    // the new value and then bails out once shown already matches, so this
    // never loops.
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
                            {/* Dialog.Description (not a plain Text) so Ark UI wires
                                aria-describedby on the dialog itself : a screen reader
                                announcing this alertdialog reads the warning text, not
                                just the title, without a caller having to do it by hand. */}
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
                        {/* Chakra v3's Dialog.CloseTrigger renders no icon of its own
                            (unlike v2) - without explicit children it was an empty
                            0x0 button, invisible to every user, not just screen
                            readers (axe-core button-name audit). */}
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
