import React from "react";
import { Alert } from "@chakra-ui/react";

interface FormAlertProps {
    // Chakra's Alert also supports "info"/"neutral" if a future caller needs
    // them. "warning" backs the "primary action succeeded, but a secondary
    // side-effect didn't" case (e.g. password-reset-confirm's
    // sessions_revoked: false), distinct from "error" and "success".
    status: "error" | "success" | "warning";
    // Lets a caller point a field's aria-describedby at this alert, so a
    // screen reader announces the error in context with the input it concerns.
    id?: string;
    /** Chakra Alert size, forwarded to Alert.Root. Defaults to "md" (its
     * own Chakra default, textStyle "sm") so every existing caller keeps
     * its current text size unchanged; pass "lg" (textStyle "md") where a
     * surrounding page has standardized on nothing smaller than that. */
    size?: "sm" | "md" | "lg";
    children: React.ReactNode;
}

/**
 * Thin wrapper around Chakra v3's Alert.Root, replacing the ad hoc
 * `<Text color="red.500">` / `<Text color="green.500">` pattern repeated
 * across every auth form. Chakra's Alert.Root renders no `role` itself, so
 * without one a screen reader never announces this content when it appears.
 */
const FormAlert: React.FC<FormAlertProps> = ({ status, id, size, children }) => {
    return (
        <Alert.Root status={status} size={size} borderRadius="md" id={id} role="alert">
            <Alert.Indicator />
            <Alert.Title>{children}</Alert.Title>
        </Alert.Root>
    );
};

export default FormAlert;
