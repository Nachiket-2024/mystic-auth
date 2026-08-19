import React from "react";
import { Box, Flex, HStack } from "@chakra-ui/react";

import ThemeToggle from "../controls/ThemeToggle";
import LanguageToggle from "../controls/LanguageToggle";
import FontSizeControl from "../controls/FontSizeControl";

interface AuthLayoutProps {
    children: React.ReactNode;
    /**
     * "form" (default): vertically + horizontally centered, for login/signup/
     * reset-password style forms.
     * "status": horizontally centered but top-aligned with fixed top spacing,
     * for verification/confirmation/status pages whose content height varies.
     */
    variant?: "form" | "status";
}

/**
 * Shared shell for unauthenticated pages: a plain canvas (no colored banner,
 * no separate site-chrome header/footer bands), theme/language toggles
 * pinned top-right, and the card as the only composed unit on the page. No
 * copyright/legal footer: most production auth screens (Linear, Stripe,
 * Notion, Clerk's hosted pages) skip one entirely, and the effect of adding
 * one back here was exactly the "floating text" problem this layout was
 * rewritten to avoid - an isolated line with no real function on a gate
 * screen, disconnected from the card above it.
 */
const AuthLayout: React.FC<AuthLayoutProps> = ({ children, variant = "form" }) => {
    return (
        <Flex
            direction="column"
            minH="100vh"
            bg="bg.canvas"
            // Same soft depth treatment as AppLayout - see bg.canvasFrom/To's
            // own comment in theme/system.ts.
            bgGradient="to-b"
            gradientFrom="bg.canvasFrom"
            gradientTo="bg.canvasTo"
        >
            {/* In normal document flow (not position="absolute") so it always
                reserves its own row height. An absolutely-positioned overlay
                here would float outside the flex layout that centers the
                content below, so on short viewports or taller cards (e.g.
                signup's, with more fields than login) the card's top edge
                could rise up underneath these controls and visually collide
                with them. */}
            <Box px={4} pt={4}>
                <HStack gap={3} justify="flex-end">
                    <FontSizeControl />
                    <LanguageToggle />
                    <ThemeToggle />
                </HStack>
            </Box>

            <Flex
                flex="1"
                direction="column"
                align="center"
                justify={variant === "status" ? "flex-start" : "center"}
                pt={variant === "status" ? { base: 10, md: 16 } : 4}
                pb={8}
                px={4}
            >
                {children}
            </Flex>
        </Flex>
    );
};

export default AuthLayout;