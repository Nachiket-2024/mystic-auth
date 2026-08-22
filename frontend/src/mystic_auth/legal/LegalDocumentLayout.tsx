import React, { useEffect } from "react";
import { Button, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";

import Card from "../ui/Card";
import AuthLayout from "../layout/auth_layout/AuthLayout";
import Logo from "../layout/app_layout/Logo";
import { BRAND_SOLID_HOVER_PROPS } from "../ui/styles/buttonStyles";
import { useAuthStore } from "../store/authStore";

export interface LegalSection {
    heading: string;
    paragraphs: string[];
}

interface LegalDocumentLayoutProps {
    title: string;
    lastUpdatedLabel: string;
    lastUpdatedDate: string;
    backLabel: string;
    intro: string[];
    sections: LegalSection[];
}

/**
 * Goes back to wherever the visitor actually came from (Sidebar footer for
 * an authenticated user, LoginPage/SignupForm's footnote for a visitor)
 * instead of hardcoding "/" - that previously bounced every "Back" click to
 * the landing page even when the click originated from deep inside the
 * authenticated app. `location.key !== "default"` is react-router's own
 * signal for "this entry has a predecessor in *this* browser history stack"
 * (a fresh/bookmarked load of /privacy or /terms gets the literal string
 * "default" instead of a generated key) - only then is `navigate(-1)` safe;
 * otherwise fall back to the same destination the document would have sent
 * an already-signed-in visitor to anyway (/dashboard), or "/" for a visitor
 * who isn't signed in.
 */
const BackButton: React.FC<{ label: string }> = ({ label }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    const handleBack = () => {
        if (location.key !== "default") {
            navigate(-1);
        } else {
            navigate(isAuthenticated ? "/dashboard" : "/");
        }
    };

    return (
        <Button colorPalette="brand" size="sm" onClick={handleBack} {...BRAND_SOLID_HOVER_PROPS}>
            <ArrowLeft size={16} aria-hidden="true" />
            {label}
        </Button>
    );
};

/**
 * Shared shell for the Privacy Policy and Terms of Service pages: same
 * AuthLayout/Card chrome (plus the same Logo every other unauthenticated
 * page opens with, so this reads as a full page rather than starting cold
 * at the document title) as the rest of the unauthenticated flow, just wide
 * enough to read prose comfortably instead of the narrow auth-form width.
 *
 * Purely presentational - all translated content is resolved by the caller
 * (PrivacyPolicyPage/TermsOfServicePage, via the "legal" i18n namespace) and
 * passed in as props, so this component doesn't need to know which document
 * it's rendering.
 */
const LegalDocumentLayout: React.FC<LegalDocumentLayoutProps> = ({
    title,
    lastUpdatedLabel,
    lastUpdatedDate,
    backLabel,
    intro,
    sections,
}) => {
    // These are also reachable via an in-app link (Sidebar's footer, once
    // logged in) whose page can be scrolled well past the top - without
    // this, a client-side navigation here keeps that old scroll position,
    // landing mid-document instead of at the top of the page.
    useEffect(() => {
        // `document.body`, not the viewport, is this app's actual
        // scrolling element (see globalCss's html/body split in
        // theme/themeStyles.ts) - window.scrollTo(0, 0) targets the
        // viewport/documentElement and is a silent no-op here.
        document.body.scrollTop = 0;
    }, []);

    return (
        <AuthLayout variant="status">
            <Card w="full" maxW="3xl" p={{ base: 5, md: 8 }}>
                <Stack gap={6}>
                    <HStack justify="space-between" align="center">
                        {/* Default (md) size, not Sidebar's compact "sm" -
                            now that the title below no longer repeats the
                            app name (see PrivacyPolicyPage/TermsOfServicePage),
                            this is the only brand mark on the page, same
                            "primary visual anchor" role Logo plays on
                            LoginPage/SignupPage. */}
                        <Logo />
                        <BackButton label={backLabel} />
                    </HStack>

                    <Stack gap={1}>
                        <Heading as="h1" size="xl" color="brand.fg" textStyle="pageTitle">
                            {title}
                        </Heading>
                        <Text fontSize="sm" color="fg.muted">
                            {lastUpdatedLabel}: {lastUpdatedDate}
                        </Text>
                    </Stack>

                    <Stack gap={3}>
                        {intro.map((paragraph) => (
                            <Text key={paragraph} color="fg.default" fontSize="md">
                                {paragraph}
                            </Text>
                        ))}
                    </Stack>

                    {sections.map((section) => (
                        <Stack key={section.heading} gap={2}>
                            <Heading as="h2" size="md" color="brand.fg" textStyle="sectionHeader">
                                {section.heading}
                            </Heading>
                            {section.paragraphs.map((paragraph) => (
                                <Text key={paragraph} color="fg.default" fontSize="md">
                                    {paragraph}
                                </Text>
                            ))}
                        </Stack>
                    ))}

                    <HStack justify="flex-end">
                        <BackButton label={backLabel} />
                    </HStack>
                </Stack>
            </Card>
        </AuthLayout>
    );
};

export default LegalDocumentLayout;
