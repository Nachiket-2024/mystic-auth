import React, { useEffect } from "react";
import { Button, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";

import { Card, AuthLayout, Logo, BRAND_SOLID_HOVER_PROPS, useAuthStore } from "../sdk";

// Side-effect import: registers the "legal" i18next namespace so both
// PrivacyPolicyPage and TermsOfServicePage's useTranslation("legal") calls
// resolve, regardless of which one is visited first. Lives here (the shell
// both pages render through) so it only needs registering once.
import "./translations/registerLegalTranslations";

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
 * an authenticated user, LoginPage/SignupForm's footnote otherwise) instead
 * of hardcoding "/", which used to send every "Back" click to the landing
 * page even from deep inside the app. `location.key !== "default"` is
 * react-router's signal that this history entry has a predecessor in this
 * browser tab (a fresh/bookmarked load of /privacy or /terms gets the
 * literal string "default"); only then is `navigate(-1)` safe. Otherwise
 * fall back to /dashboard (signed in) or "/" (not signed in).
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
 * AuthLayout/Card chrome as the rest of the unauthenticated flow (plus the
 * same Logo so the page doesn't start cold at the document title), just
 * wide enough for comfortable prose instead of the narrow auth-form width.
 *
 * Purely presentational: the caller (PrivacyPolicyPage/TermsOfServicePage)
 * resolves all translated content via the "legal" i18n namespace and passes
 * it in as props, so this component doesn't need to know which document
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
    // Reachable via an in-app link (Sidebar's footer) whose page may be
    // scrolled well past the top; without this, navigating here keeps that
    // old scroll position instead of landing at the top of the document.
    useEffect(() => {
        // `document.body`, not the viewport, is this app's actual scrolling
        // element (see globalCss's html/body split in theme/themeStyles.ts).
        // window.scrollTo(0, 0) would be a silent no-op here.
        document.body.scrollTop = 0;
    }, []);

    return (
        <AuthLayout variant="status">
            <Card w="full" maxW="3xl" p={{ base: 5, md: 8 }}>
                <Stack gap={6}>
                    <HStack justify="space-between" align="center">
                        {/* Default (md) size, not Sidebar's compact "sm": this is the only
                            brand mark on the page, same anchor role Logo plays on
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
