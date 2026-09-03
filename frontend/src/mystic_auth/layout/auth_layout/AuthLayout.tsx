import React from "react";
import { Box, Flex } from "@chakra-ui/react";

import ControlCluster from "../controls/ControlCluster";

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
 * Shared shell for unauthenticated pages: plain canvas, theme/language
 * toggles pinned top-right, and the card as the only composed unit. No
 * copyright/legal footer, deliberately: an isolated line with no real
 * function on a gate screen, disconnected from the card above it.
 */
const AuthLayout: React.FC<AuthLayoutProps> = ({ children, variant = "form" }) => {
    return (
        <Flex
            direction="column"
            minH="100vh"
            bg="bg.canvas"
            // Same soft depth treatment as AppLayout; see theme/system.ts.
            bgGradient="to-b"
            gradientFrom="bg.canvasFrom"
            gradientTo="bg.canvasTo"
        >
            {/* Normal document flow (not position="absolute"), so it reserves
                its own row height and never collides with a tall card's top
                edge on short viewports. */}
            <Box px={4} pt={4}>
                <Flex justify="flex-end">
                    <ControlCluster />
                </Flex>
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