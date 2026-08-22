import React from "react";
import { HStack } from "@chakra-ui/react";

import FontSizeControl from "./FontSizeControl";
import LanguageToggle from "./LanguageToggle";
import ThemeToggle from "./ThemeToggle";

/**
 * Font size / language / theme toggles - three separately-boxed, brand-
 * tinted buttons (see BRAND_ICON_BUTTON_PROPS in ui/styles/buttonStyles.ts),
 * shared by Navbar, AuthLayout and LandingPage, the three places this exact
 * trio appears together. A single shared-border grouped/segmented-control
 * version was tried and reverted back to this standalone layout.
 */
const ControlCluster: React.FC = () => (
    <HStack gap={3}>
        <FontSizeControl />
        <LanguageToggle />
        <ThemeToggle />
    </HStack>
);

export default ControlCluster;
