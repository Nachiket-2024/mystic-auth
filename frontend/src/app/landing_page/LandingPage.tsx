import React from "react";
import { Navigate, Link as RouterLink } from "react-router";
import { Box, Button, Flex, Grid, Heading, HStack, Icon, Text } from "@chakra-ui/react";
import { ShieldCheck, KeyRound, ScrollText, Globe } from "lucide-react";

// Everything below comes from the public extension surface (../sdk), not
// internal mystic_auth/* paths - see docs/mystic_auth/template-usage/overview.md
// and worked-example.md#6-a-pre-auth-landing-page. This page is the
// reference example for "a page that lives outside the authenticated app
// shell (no Sidebar/Navbar) but still wants the app's own theme tokens and
// session state," the same way app/projects/ProjectsPage.tsx in the worked
// example is the reference for "a page inside the shell."
import {
    useAuthStore,
    APP_NAME,
    Card,
    Logo,
    SECONDARY_BUTTON_PROPS,
    BRAND_SOLID_HOVER_PROPS,
    BRAND_OUTLINE_HOVER_PROPS,
} from "../sdk";

const HIGHLIGHTS = [
    {
        icon: KeyRound,
        title: "Authentication",
        description: "Password + Google OAuth2, refresh-token rotation, brute-force lockout.",
    },
    {
        icon: ShieldCheck,
        title: "PBAC authorization",
        description: "Access decided by assigned policies, not a hardcoded role check.",
    },
    {
        icon: ScrollText,
        title: "Audit logging",
        description: "Every session event and access decision recorded, queryable per user.",
    },
    {
        icon: Globe,
        title: "Multilingual",
        description: "Ships with English, Hindi, Marathi, and Gujarati out of the box.",
    },
] as const;

/**
 * LandingPage
 * ----------------------------
 * Minimal pre-auth marketing page: a hero, a feature-highlight grid, and CTAs
 * into signup/login. Rename, restyle, or replace this entirely - it exists as
 * a worked example of the "pages outside the auth shell" pattern (no
 * AppLayout, no ProtectedRoute), not as a page meant to ship as-is.
 *
 * Redirects a signed-in visitor straight to /dashboard rather than showing
 * them marketing copy for a product they're already inside - same
 * `isAuthenticated` check LoginPage/SignupPage use, so this page and the
 * auth pages agree on what "already signed in" means.
 */
const LandingPage: React.FC = () => {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    if (isAuthenticated) return <Navigate to="/dashboard" replace />;

    return (
        <Flex
            direction="column"
            minH="100vh"
            bg="bg.canvas"
            bgGradient="to-b"
            gradientFrom="bg.canvasFrom"
            gradientTo="bg.canvasTo"
        >
            <Flex as="header" align="center" justify="space-between" px={{ base: 4, md: 8 }} py={5}>
                <Logo size="sm" />
                <HStack gap={3}>
                    <Button asChild {...SECONDARY_BUTTON_PROPS} size="sm">
                        <RouterLink to="/login">Log in</RouterLink>
                    </Button>
                    <Button asChild colorPalette="brand" size="sm" {...BRAND_SOLID_HOVER_PROPS}>
                        <RouterLink to="/signup">Sign up</RouterLink>
                    </Button>
                </HStack>
            </Flex>

            <Flex direction="column" align="center" px={4} pt={{ base: 10, md: 16 }} pb={{ base: 12, md: 20 }}>
                <Box maxW="2xl" textAlign="center">
                    <Heading as="h1" size="4xl" letterSpacing="-0.02em" mb={4}>
                        {APP_NAME} starts here
                    </Heading>
                    <Text fontSize="lg" color="fg.muted" mb={8}>
                        A replaceable hero for your own pre-auth marketing page - headline, pitch, and a
                        clear path into the app. Edit this copy (and everything else in
                        frontend/src/app/landing_page/) freely; nothing here is upstream-owned.
                    </Text>
                    <HStack gap={3} justify="center">
                        <Button asChild colorPalette="brand" size="lg" {...BRAND_SOLID_HOVER_PROPS}>
                            <RouterLink to="/signup">Get started</RouterLink>
                        </Button>
                        <Button
                            asChild
                            variant="outline"
                            colorPalette="brand"
                            size="lg"
                            {...BRAND_OUTLINE_HOVER_PROPS}
                        >
                            <RouterLink to="/login">Log in</RouterLink>
                        </Button>
                    </HStack>
                </Box>

                <Grid
                    mt={{ base: 12, md: 20 }}
                    maxW="5xl"
                    w="full"
                    templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }}
                    gap={4}
                >
                    {HIGHLIGHTS.map(({ icon, title, description }) => (
                        <Card key={title} textAlign="left">
                            <Icon as={icon} boxSize={5} color="brand.solid" mb={3} />
                            <Text fontWeight="semibold" mb={1}>
                                {title}
                            </Text>
                            <Text fontSize="sm" color="fg.muted">
                                {description}
                            </Text>
                        </Card>
                    ))}
                </Grid>
            </Flex>
        </Flex>
    );
};

export default LandingPage;
