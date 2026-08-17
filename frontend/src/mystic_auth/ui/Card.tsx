import React from "react";
import { Card as ChakraCard } from "@chakra-ui/react";
import type { CardRootProps } from "@chakra-ui/react";

/**
 * Thin wrapper around Chakra v3's Card.Root with the app's standard surface styling (theme
 * surface/border tokens, rounded corners, shadow). All CardRootProps pass through, so callers
 * can still override spacing/alignment per use.
 *
 * `shadow="density.card"` (theme/system.ts), not Chakra's stock "md": a
 * layered, tokenized elevation instead of the single flat drop-shadow every
 * default Chakra app ships with, so the app's cards read as their own look
 * rather than "stock Chakra shapes" - overridable from app/theme.ts the
 * same way every other density.* token is.
 */
const Card: React.FC<CardRootProps> = ({ children, ...props }) => {
    return (
        <ChakraCard.Root
            bg="bg.surface"
            borderWidth="1px"
            borderColor="border.default"
            rounded="density.card"
            shadow="density.card"
            p="density.cardPadding"
            {...props}
        >
            {children}
        </ChakraCard.Root>
    );
};

export default Card;
