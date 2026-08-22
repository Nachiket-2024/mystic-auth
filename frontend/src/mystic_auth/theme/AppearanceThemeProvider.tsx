import React, { useMemo } from "react";
import { ChakraProvider } from "@chakra-ui/react";

import { system, buildSystem } from "./system";
import { buildAppearanceThemeOverrides } from "./appearanceThemeOverrides";
import { useAppearanceStore } from "../store/appearanceStore";

/**
 * Rebuilds Chakra's system with the signed-in user's own brand/background
 * colors merged in (see buildSystem's docstring in system.ts for why this
 * has to happen here, at the system-build level, rather than as a post-hoc
 * CSS variable override - the earlier version of this feature did the
 * latter and silently failed to apply dark-mode values). Subscribing to
 * useAppearanceStore here means every place that reads these Chakra tokens
 * (buttons, focus rings, canvas/surface backgrounds, ...) reacts the
 * instant the store changes - AppearanceCard.tsx's color pickers need no
 * separate "preview" plumbing beyond calling the store's setters.
 *
 * useMemo skips rebuilding the system on every unrelated re-render, and
 * buildAppearanceThemeOverrides itself returns null (skip entirely, reuse
 * the shared default `system`) when nothing is customized, which is the
 * overwhelmingly common case.
 */
const AppearanceThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const brandColor = useAppearanceStore((s) => s.brandColor);

    const activeSystem = useMemo(() => {
        const overrides = buildAppearanceThemeOverrides({ brandColor });
        return overrides ? buildSystem(overrides) : system;
    }, [brandColor]);

    return <ChakraProvider value={activeSystem}>{children}</ChakraProvider>;
};

export default AppearanceThemeProvider;
