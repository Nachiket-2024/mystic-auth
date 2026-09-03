import React from "react";
import { HStack, Heading, Image } from "@chakra-ui/react";

import { APP_LOGO_URL, APP_NAME } from "../../core/settings";
import { useAppearanceStore } from "../../store/appearanceStore";
import { getBrandIconDataUri } from "../../theme/brandIcon";

interface LogoProps {
    /** "sm": Sidebar's compact header row. "md" (default): the brand mark
     * inside an auth-page card. */
    size?: "sm" | "md";
}

const SIZES = {
    sm: { badge: "8", icon: 18, radius: "md", text: "xl" },
    md: { badge: "11", icon: 22, radius: "lg", text: "2xl" },
} as const;

/**
 * Brand mark: icon badge plus wordmark. Defaults to `/favicon.svg`, the same
 * file the browser tab icon uses. Once a user picks a brand color
 * (appearanceStore.ts), both this badge and the tab icon render from
 * `getBrandIconDataUri` (theme/brandIcon.ts) instead, so they stay in sync.
 * Set VITE_APP_LOGO_URL to swap in a full custom logo (affects this mark
 * only, not the tab icon; replace public/favicon.svg for that).
 */
const Logo: React.FC<LogoProps> = ({ size = "md" }) => {
    const s = SIZES[size];
    const brandColor = useAppearanceStore((state) => state.brandColor);

    if (APP_LOGO_URL) {
        return <Image src={APP_LOGO_URL} alt={APP_NAME} h={s.badge} />;
    }

    return (
        // justify="center": self-centers regardless of whether the parent
        // stretches to full width, so callers don't need align="center".
        <HStack gap={size === "sm" ? 2 : 3} justify="center">
            <Image
                src={brandColor ? getBrandIconDataUri(brandColor) : "/favicon.svg"}
                alt=""
                boxSize={s.badge}
                flexShrink={0}
            />
            <Heading as="span" fontSize={s.text} fontWeight="bold" color="brand.fg" letterSpacing="tight">
                {APP_NAME}
            </Heading>
        </HStack>
    );
};

export default Logo;
