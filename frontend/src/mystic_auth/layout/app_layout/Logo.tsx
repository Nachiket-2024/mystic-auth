import React from "react";
import { HStack, Heading, Image } from "@chakra-ui/react";

import { APP_LOGO_URL, APP_NAME } from "../../core/settings";
import { useAppearanceStore } from "../../store/appearanceStore";
import { getBrandIconDataUri } from "../../theme/brandIcon";

interface LogoProps {
    /** "sm": Sidebar's own compact header row. "md" (default): the brand
     * mark inside an auth-page card, where it's the page's primary visual
     * anchor rather than a corner detail. */
    size?: "sm" | "md";
}

const SIZES = {
    sm: { badge: "8", icon: 18, radius: "md", text: "xl" },
    md: { badge: "11", icon: 22, radius: "lg", text: "2xl" },
} as const;

/**
 * Brand mark: the icon badge plus the wordmark. The badge image is
 * `/favicon.svg` (public/favicon.svg) by default - the same file the
 * browser tab icon comes from (see index.html's `<link rel="icon">`) - but
 * once a user has picked their own brand color (appearanceStore.ts), both
 * this badge and the tab icon instead render from `getBrandIconDataUri`
 * (theme/brandIcon.ts), the single place that SVG shape is generated from a
 * hex, so the two stay provably in sync rather than two files that happen
 * to match. Falls back to this built-in mark when VITE_APP_LOGO_URL is
 * unset, so a fresh fork gets a real logo instead of plain text on day one;
 * set that env var to swap in a full custom logo image instead (that
 * override only affects this in-app mark, not the browser tab icon -
 * replace public/favicon.svg for that).
 */
const Logo: React.FC<LogoProps> = ({ size = "md" }) => {
    const s = SIZES[size];
    const brandColor = useAppearanceStore((state) => state.brandColor);

    if (APP_LOGO_URL) {
        return <Image src={APP_LOGO_URL} alt={APP_NAME} h={s.badge} />;
    }

    return (
        // justify="center": some callers (e.g. SignupPage's wide two-column
        // form) stretch this component's flex-column parent to full width
        // rather than centering it, so this centers itself either way
        // instead of depending on every caller getting align="center" right.
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
