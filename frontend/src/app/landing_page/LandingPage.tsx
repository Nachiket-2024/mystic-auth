import React from "react";
import { Navigate, Link as RouterLink } from "react-router";
import { Box, Button, Flex, Grid, Heading, HStack, Icon, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, KeyRound, ScrollText, Globe } from "lucide-react";

// Everything below comes from the public extension surface (../sdk), not
// internal mystic_auth/* paths. This page is the reference example for "a
// page outside the authenticated app shell (no Sidebar/Navbar) that still
// wants the app's theme tokens and session state" - see
// docs/mystic_auth/template-usage/overview.md and worked-example.md#6-a-pre-auth-landing-page.
import {
    useAuthStore,
    APP_NAME,
    Card,
    Logo,
    ControlCluster,
    AuthInlineLink,
    BRAND_SOLID_HOVER_PROPS,
    BRAND_OUTLINE_HOVER_PROPS,
} from "../sdk";

// Side-effect import: registers the "landing" i18next namespace so
// useTranslation("landing") below has something to resolve.
import "./translations/registerLandingTranslations";

const HIGHLIGHTS = [
    { icon: KeyRound, key: "authentication" },
    { icon: ShieldCheck, key: "authorization" },
    { icon: ScrollText, key: "auditLog" },
    { icon: Globe, key: "multilingual" },
] as const;

/**
 * LandingPage
 * ----------------------------
 * Minimal pre-auth marketing page: hero, feature-highlight grid, and CTAs
 * into signup/login. It's a worked example of the "outside the auth shell"
 * pattern (no AppLayout, no ProtectedRoute), not meant to ship as-is.
 *
 * Redirects a signed-in visitor to /dashboard instead of showing marketing
 * copy for a product they're already in, using the same `isAuthenticated`
 * check LoginPage/SignupPage use.
 */
const LandingPage: React.FC = () => {
    const { t } = useTranslation("landing");
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    if (isAuthenticated) return <Navigate to="/dashboard" replace />;

    return (
        <Flex
            direction="column"
            minH="100vh"
            overflowY="auto"
            bg="bg.canvas"
            bgGradient="to-b"
            gradientFrom="bg.canvasFrom"
            gradientTo="bg.canvasTo"
        >
            <Flex
                as="header"
                align="center"
                justify="space-between"
                wrap="wrap"
                rowGap={2}
                px={{ base: 4, md: 8 }}
                py={{ base: 3, md: 4 }}
            >
                <Logo size="sm" />
                <HStack gap={3} wrap="wrap" justify="flex-end">
                    <ControlCluster />
                    <Button
                        asChild
                        variant="outline"
                        colorPalette="brand"
                        size="sm"
                        borderWidth="2px"
                        {...BRAND_OUTLINE_HOVER_PROPS}
                        // Matches BRAND_OUTLINE_HOVER_PROPS's text color; a border in a
                        // different color than the label would look like a mismatch.
                        borderColor="brand.fg"
                    >
                        <RouterLink to="/login">{t("logIn")}</RouterLink>
                    </Button>
                    <Button asChild colorPalette="brand" size="sm" {...BRAND_SOLID_HOVER_PROPS}>
                        <RouterLink to="/signup">{t("signUp")}</RouterLink>
                    </Button>
                </HStack>
            </Flex>

            {/* flex="1" + centered content (same pattern as AuthLayout) fills the
                remaining viewport height instead of pushing the footer below
                the fold, so there's no page scroll at typical viewport heights. */}
            <Flex flex="1" direction="column" align="center" justify="center" px={4} minH={0}>
                <Box maxW="2xl" mx="auto" textAlign="center">
                    <Heading as="h1" size="4xl" letterSpacing="-0.02em" mb={3}>
                        {t("hero.title")}
                    </Heading>
                    <Text fontSize="lg" color="fg.muted" mb={5}>
                        {t("hero.subtitle", { appName: APP_NAME })}
                    </Text>
                    <HStack gap={3} justify="center">
                        <Button asChild colorPalette="brand" size="lg" {...BRAND_SOLID_HOVER_PROPS}>
                            <RouterLink to="/signup">{t("hero.getStarted")}</RouterLink>
                        </Button>
                        {/* borderWidth="2px" (Chakra's outline default is 1px): next to the
                            solid "Get started" button, a 1px outline read as barely visible. */}
                        <Button
                            asChild
                            variant="outline"
                            colorPalette="brand"
                            size="lg"
                            borderWidth="2px"
                            {...BRAND_OUTLINE_HOVER_PROPS}
                            // Same reasoning as the header Login button's borderColor above.
                            borderColor="brand.fg"
                        >
                            <RouterLink to="/login">{t("logIn")}</RouterLink>
                        </Button>
                    </HStack>
                </Box>

                <Grid
                    mt={{ base: 6, md: 10 }}
                    maxW="5xl"
                    w="full"
                    templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }}
                    gap={3}
                >
                    {HIGHLIGHTS.map(({ icon, key }) => (
                        <Card key={key} textAlign="left" p={4}>
                            <Icon as={icon} boxSize={5} color="brand.solid" mb={2} />
                            <Text fontWeight="semibold" mb={1}>
                                {t(`highlights.${key}.title`)}
                            </Text>
                            <Text fontSize="sm" color="fg.muted">
                                {t(`highlights.${key}.description`)}
                            </Text>
                        </Card>
                    ))}
                </Grid>
            </Flex>

            {/* AuthInlineLink (not a plain RouterLink) gives the same underline/darken
                hover treatment as LoginPage/SignupForm's Privacy/Terms footnote. */}
            <Flex as="footer" justify="center" py={{ base: 3, md: 4 }} px={4}>
                <HStack gap={4} fontSize="sm" color="fg.muted">
                    <AuthInlineLink to="/privacy">{t("footer.privacyPolicy")}</AuthInlineLink>
                    <Text as="span">·</Text>
                    <AuthInlineLink to="/terms">{t("footer.termsOfService")}</AuthInlineLink>
                </HStack>
            </Flex>
        </Flex>
    );
};

export default LandingPage;
