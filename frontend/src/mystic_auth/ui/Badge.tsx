import React from "react";
import { Badge as ChakraBadge } from "@chakra-ui/react";
import type { BadgeProps as ChakraBadgeProps } from "@chakra-ui/react";

/**
 * Thin wrapper around Chakra v3's Badge with a default 1px border. `subtle`
 * badges are just a soft tint + colored text with no border of their own, so
 * on a light `bg.surface`/`bg.canvas` many colorPalette/mode combinations
 * (e.g. gray, yellow) read as a barely-there smudge rather than a legible
 * chip - the same contrast gap `border.default` was introduced to close for
 * cards/tables (see theme/themeSemanticTokens.ts). `colorPalette.border`
 * resolves for both Chakra's stock palettes (auto-generated) and this app's
 * custom brand/accent palettes (explicitly added in themeSemanticTokens.ts).
 */
const Badge: React.FC<ChakraBadgeProps> = ({ children, ...props }) => {
    return (
        <ChakraBadge borderWidth="1px" borderColor="colorPalette.border" {...props}>
            {children}
        </ChakraBadge>
    );
};

export default Badge;
