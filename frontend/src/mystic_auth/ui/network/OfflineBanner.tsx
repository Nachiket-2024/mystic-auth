import React, { useEffect, useState } from "react";
import { Alert } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import { useNetworkStatusStore } from "../../store/networkStatusStore";

// How long the "back online" confirmation stays up once shown: long enough
// to register as reassurance, short enough not to linger like permanent
// chrome would.
const RECONNECTED_BANNER_MS = 4000;

/**
 * Fixed banner reflecting networkStatusStore's isOnline flag, mounted once
 * at the app root. Without it, losing the connection only shows up as
 * scattered failed-request toasts; this gives it one unmissable source.
 *
 * Briefly confirms reconnection too (RECONNECTED_BANNER_MS), then hides
 * itself, same "temporary reassurance" reasoning as RouteProgressBar.
 */
const OfflineBanner: React.FC = () => {
    const { t } = useTranslation("ui_text");
    const isOnline = useNetworkStatusStore((s) => s.isOnline);

    const [lastSeenOnline, setLastSeenOnline] = useState(isOnline);
    const [showReconnected, setShowReconnected] = useState(false);

    // Adjust state during render (same pattern as ConfirmDialog.tsx), not an
    // effect, so a false->true reconnect right before unmount still
    // registers. Flipping back offline clears showReconnected immediately.
    if (isOnline !== lastSeenOnline) {
        setLastSeenOnline(isOnline);
        setShowReconnected(isOnline);
    }

    // The timer itself is a legitimate effect (scheduling/cleanup against
    // an external clock), unlike the synchronous state adjustment above.
    useEffect(() => {
        if (!showReconnected) return;
        const timeoutId = window.setTimeout(() => setShowReconnected(false), RECONNECTED_BANNER_MS);
        return () => window.clearTimeout(timeoutId);
    }, [showReconnected]);

    if (isOnline && !showReconnected) return null;

    return (
        <Alert.Root
            status={isOnline ? "success" : "warning"}
            role="status"
            aria-live="polite"
            position="fixed"
            bottom={0}
            insetInline={0}
            zIndex="max"
            justifyContent="center"
            borderRadius={0}
        >
            <Alert.Indicator />
            <Alert.Title>{isOnline ? t("offlineBanner.backOnline") : t("offlineBanner.offline")}</Alert.Title>
        </Alert.Root>
    );
};

export default OfflineBanner;
