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
 * at the app root (App.tsx) alongside Toaster/RouteProgressBar. Without
 * this, losing the connection shows up only as scattered failed-request
 * toasts per action - this gives it one unmissable, unambiguous source
 * instead.
 *
 * Briefly confirms reconnection too (status="success" for
 * RECONNECTED_BANNER_MS), then hides itself, rather than just disappearing
 * the instant the offline banner would - same "temporary reassurance, not
 * permanent chrome" reasoning as RouteProgressBar's own bar.
 */
const OfflineBanner: React.FC = () => {
    const { t } = useTranslation("ui_text");
    const isOnline = useNetworkStatusStore((s) => s.isOnline);

    const [lastSeenOnline, setLastSeenOnline] = useState(isOnline);
    const [showReconnected, setShowReconnected] = useState(false);

    // "Adjust state during render" (React's own sanctioned replacement for
    // setState-in-an-effect, see react-hooks/set-state-in-effect - same
    // pattern and reasoning as ConfirmDialog.tsx's frozen title/description
    // snapshot): reacting to the isOnline transition has to happen on the
    // very render it flips, not a tick later via an effect, so a
    // false -> true reconnect right before a component unmount still
    // registers. Only an actual false -> true transition earns the
    // confirmation - a page that loads already online, or one that's still
    // offline, never sets it; flipping back offline while the confirmation
    // is still showing clears it immediately in favor of the offline
    // warning below.
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
